import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouponsByOwner, getCouponById, insertCoupon, updateCoupon, deleteCoupon, type Coupon } from '../repositories/coupons';
import { removeCouponFromAllGroups, pushCouponUpdated, getGroupsContainingCoupon, getGroupsByUser } from '../repositories/groups';
import { findUserById } from '../repositories/users';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { crawlRedeemableStores } from '../services/crawler';
import { applyRedemption, parseRedeemAction, notifyCouponRedeemed } from '../services/redemption';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const coupons = await getCouponsByOwner(req.userId!);
  res.json(coupons);
});

// GET /coupons/shared-with-me - every coupon other members have shared into a
// group the caller belongs to, with the sharer and the groups it came through.
//
// Declared before any '/:id' route so the literal path can't be captured as an id.
//
// Metadata only, exactly like GET /groups/:id - no coupon_code, no image. The
// security invariant is unchanged: this endpoint says a coupon EXISTS and who
// shared it, never what it is worth redeeming. Codes still reach the device
// only over P2P or the encrypted fallback.
router.get('/shared-with-me', async (req: AuthRequest, res: Response): Promise<void> => {
  const groups = await getGroupsByUser(req.userId!);

  // One coupon can be shared into several of the caller's groups, so gather the
  // groups per coupon and emit a single row per coupon rather than duplicating it.
  const groupsByCoupon = new Map<string, { group_id: string; name: string }[]>();
  for (const g of groups) {
    for (const couponId of g.coupon_id_list ?? []) {
      const list = groupsByCoupon.get(couponId) ?? [];
      list.push({ group_id: g.group_id, name: g.name });
      groupsByCoupon.set(couponId, list);
    }
  }

  const couponDocs = await Promise.all(
    [...groupsByCoupon.keys()].map(couponId => getCouponById(couponId))
  );

  // The caller's own coupons already come from GET /coupons. Including them
  // here would double every row once the client merges the two lists.
  const shared = couponDocs.filter(
    (c): c is Coupon => !!c && c.owner_id !== req.userId!
  );

  // Resolve each distinct owner once - one member typically shares several coupons.
  const ownerIds = [...new Set(shared.map(c => c.owner_id))];
  const ownerDocs = await Promise.all(ownerIds.map(uid => findUserById(uid)));
  const owners = new Map(ownerDocs.filter(Boolean).map(u => [u!.user_id, u!]));

  res.json(
    shared.map(c => {
      const owner = owners.get(c.owner_id);
      return {
        coupon_id: c.coupon_id,
        owner_id: c.owner_id,
        category: c.category,
        store_name: c.store_name,
        expiration_date: c.expiration_date,
        balance: c.balance,
        status: c.status,
        created_at: c.created_at,
        giftcard_url: c.giftcard_url ?? null,
        shared_by: owner
          ? { user_id: owner.user_id, username: owner.username, image: owner.profile_image ?? null }
          : null,
        groups: groupsByCoupon.get(c.coupon_id) ?? [],
      };
    })
  );
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { category, store_name, expiration_date, balance, giftcard_url } = req.body;

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
    giftcard_url: giftcard_url ?? null,
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

// The fields GET /groups/:id exposes to members - only these are worth a
// live refresh on other people's devices.
const GROUP_VISIBLE_FIELDS = ['category', 'store_name', 'expiration_date', 'balance', 'status', 'giftcard_url'];

router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { category, store_name, expiration_date, balance, status, giftcard_url } = req.body;

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
  if (giftcard_url !== undefined) fields.giftcard_url = giftcard_url;

  // This is the general-purpose edit endpoint, so an absolute balance is the
  // right semantic here. Redeeming goes through /:id/redeem below, which is
  // atomic. The notify is kept as a safety net for anything that sets 'used'
  // through this route directly.
  const wasAlreadyUsed = status === 'used'
    ? (await getCouponById(req.params.id))?.status === 'used'
    : false;

  const updated = await updateCoupon(req.params.id, req.userId!, fields);
  if (!updated) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }

  if (status === 'used' && !wasAlreadyUsed) {
    await notifyCouponRedeemed(updated, req.userId!, { kind: 'full' });
  } else if (GROUP_VISIBLE_FIELDS.some(f => f in fields)) {
    // Edits change what group members see on their group screen, which
    // otherwise sits stale until they navigate away and back. This is a
    // live refresh only - no notification row, no banner (see
    // pushCouponUpdated). Awaited for the same Lambda-freeze reason.
    await pushCouponUpdated(req.params.id, req.userId!);
  }

  res.json(updated);
});

// POST /coupons/:id/redeem - owner redeems their own coupon.
// Body: { redeem_all: true } or { amount: <number > 0> }.
router.post('/:id/redeem', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = parseRedeemAction(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const coupon = await getCouponById(req.params.id);
  if (!coupon || coupon.owner_id !== req.userId!) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }

  const outcome = await applyRedemption(req.params.id, req.userId!, parsed);
  if (outcome.status !== 200) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }
  res.json(outcome.coupon);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const deleted = await deleteCoupon(req.params.id, req.userId!);
  if (!deleted) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  // Clean up stale group references in the background
  removeCouponFromAllGroups(req.params.id).catch(() => {});
  res.status(204).send();
});

// GET /coupons/:id/groups - owner-only. Which groups this coupon is
// currently shared to, so the client knows where to redeliver an edited code
// (see POST /groups/:id/coupons/:couponId's code_updated branch). The code
// itself never touches the server, so only the owner's device - the one that
// holds it - can drive this redelivery; the server just needs to say where.
router.get('/:id/groups', async (req: AuthRequest, res: Response): Promise<void> => {
  const coupon = await getCouponById(req.params.id);
  if (!coupon || coupon.owner_id !== req.userId!) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  const groups = await getGroupsContainingCoupon(req.params.id);
  res.json(groups.map(g => ({ group_id: g.group_id, name: g.name })));
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
