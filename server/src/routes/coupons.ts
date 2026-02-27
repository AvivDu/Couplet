import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response): void => {
  const coupons = db.getCouponsByOwner(req.userId!);
  res.json(coupons);
});

router.post('/', (req: AuthRequest, res: Response): void => {
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

  db.insertCoupon(coupon);
  res.status(201).json(coupon);
});

router.patch('/:id', (req: AuthRequest, res: Response): void => {
  const { category, store_name, expiration_date, balance, status } = req.body;

  const fields: Record<string, unknown> = {};
  if (category !== undefined) fields.category = category;
  if (store_name !== undefined) fields.store_name = store_name;
  if (expiration_date !== undefined) fields.expiration_date = expiration_date;
  if (balance !== undefined) fields.balance = balance;
  if (status !== undefined) fields.status = status;

  const updated = db.updateCoupon(req.params.id, req.userId!, fields);
  if (!updated) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }

  res.json(updated);
});

router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const deleted = db.deleteCoupon(req.params.id, req.userId!);
  if (!deleted) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  res.status(204).send();
});

export default router;
