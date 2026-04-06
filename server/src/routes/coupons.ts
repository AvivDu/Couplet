import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouponsByOwner, getCouponById, insertCoupon, updateCoupon, deleteCoupon } from '../repositories/coupons';
import { authMiddleware, AuthRequest } from '../middleware/auth';

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
  const { lat, lng } = req.query;
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

  const query = encodeURIComponent(coupon.store_name);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&location=${lat},${lng}&radius=10000&key=${apiKey}`;

  const placesRes = await fetch(url);
  const placesData = await placesRes.json() as any;

  const locations = (placesData.results ?? []).slice(0, 10).map((place: any) => ({
    name: place.name,
    address: place.formatted_address,
    lat: place.geometry?.location?.lat ?? null,
    lng: place.geometry?.location?.lng ?? null,
    openNow: place.opening_hours?.open_now ?? null,
    rating: place.rating ?? null,
  }));

  res.json(locations);
});

export default router;
