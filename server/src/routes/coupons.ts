import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouponsByOwner, getCouponById, insertCoupon, updateCoupon, deleteCoupon } from '../repositories/coupons';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { crawlRedeemableStores } from '../services/crawler';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const coupons = await getCouponsByOwner(req.userId!);
  res.json(coupons);
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { category, store_name, expiration_date, balance } = req.body;

  if (!category || !store_name) {
    res.status(400).json({ error: 'category and store_name are required' });
    return;
  }

  const coupon = {
    coupon_id: uuidv4(),
    owner_id: req.userId!,
    category,
    store_name,
    expiration_date: expiration_date ?? null,
    balance: balance ?? null,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  await insertCoupon(coupon);
  res.status(201).json(coupon);

  // Fire-and-forget: crawl participating stores in the background
  crawlRedeemableStores(store_name).then(stores => {
    if (stores.length > 0) {
      console.log(`[crawler] "${store_name}" → ${stores.length} stores found`);
      updateCoupon(coupon.coupon_id, req.userId!, { redeemable_stores: stores });
    }
  }).catch(() => {});
});

const VALID_STATUSES = ['active', 'expired', 'used'];

router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { category, store_name, expiration_date, balance, status } = req.body;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }

  const fields: Record<string, unknown> = {};
  if (category !== undefined) fields.category = category;
  if (store_name !== undefined) fields.store_name = store_name;
  if (expiration_date !== undefined) fields.expiration_date = expiration_date;
  if (balance !== undefined) fields.balance = balance;
  if (status !== undefined) fields.status = status;

  const updated = await updateCoupon(req.params.id, req.userId!, fields);
  if (!updated) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }

  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const deleted = await deleteCoupon(req.params.id, req.userId!);
  if (!deleted) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  res.status(204).send();
});

router.get('/:id/locations', async (req: AuthRequest, res: Response): Promise<void> => {
  const { lat, lng, radius } = req.query;
  if (!lat || !lng) {
    res.status(400).json({ error: 'lat and lng query params are required' });
    return;
  }

  const coupon = await getCouponById(req.params.id);
  if (!coupon || coupon.owner_id !== req.userId!) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Places API not configured' });
    return;
  }

  const radiusMeters = Math.min(Number(radius) || 3000, 10000);
  const userLat = Number(lat);
  const userLng = Number(lng);
  const center = { latitude: userLat, longitude: userLng };

  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Use redeemable_stores if crawled, otherwise fall back to store_name
  const searchTerms = (coupon.redeemable_stores && coupon.redeemable_stores.length > 0)
    ? coupon.redeemable_stores.slice(0, 6)   // cap at 6 parallel API calls
    : [coupon.store_name];

  console.log(`[locations] searching ${searchTerms.length} term(s) within ${radiusMeters}m at (${lat}, ${lng})`);

  async function searchPlaces(query: string) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey!,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.currentOpeningHours,places.rating',
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: { circle: { center, radius: radiusMeters } },
        maxResultCount: 5,
      }),
    });
    const data = await res.json() as any;
    return (data.places ?? []).map((place: any) => {
      const placeLat = place.location?.latitude ?? null;
      const placeLng = place.location?.longitude ?? null;
      const distanceKm = (placeLat !== null && placeLng !== null)
        ? haversineKm(userLat, userLng, placeLat, placeLng)
        : null;
      return {
        name: place.displayName?.text ?? '',
        address: place.formattedAddress ?? '',
        lat: placeLat,
        lng: placeLng,
        openNow: place.currentOpeningHours?.openNow ?? null,
        rating: place.rating ?? null,
        distanceKm,
      };
    });
  }

  const results = await Promise.all(searchTerms.map(searchPlaces));

  // Flatten, deduplicate by address, sort by distance, cap at 15
  const seen = new Set<string>();
  const locations = results.flat()
    .filter(loc => {
      if (seen.has(loc.address)) return false;
      seen.add(loc.address);
      return true;
    })
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, 15);

  console.log(`[locations] returning ${locations.length} locations`);
  res.json(locations);
});

export default router;
