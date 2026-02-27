import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// POST /groups — create a group
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const group = {
    group_id: uuidv4(),
    name: name.trim(),
    admin_user_id: req.userId!,
    user_id_list: [req.userId!],
    coupon_id_list: [],
    created_at: new Date().toISOString(),
  };

  await db.createGroup(group);
  res.status(201).json(group);
});

// GET /groups — list groups for current user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const groups = await db.getGroupsByUser(req.userId!);
  res.json(groups);
});

// GET /groups/:id — group detail with enriched member + coupon info
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const group = await db.getGroupById(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  if (!group.user_id_list.includes(req.userId!)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const [memberDocs, couponDocs] = await Promise.all([
    Promise.all(group.user_id_list.map(uid => db.findUserById(uid))),
    Promise.all(group.coupon_id_list.map(cid => db.getCouponById(cid))),
  ]);

  const members = memberDocs
    .filter(Boolean)
    .map(u => ({ user_id: u!.user_id, username: u!.username, email: u!.email }));

  const coupons = couponDocs
    .filter(Boolean)
    .map(c => ({
      coupon_id: c!.coupon_id,
      owner_id: c!.owner_id,
      category: c!.category,
      store_name: c!.store_name,
      expiration_date: c!.expiration_date,
      balance: c!.balance,
      status: c!.status,
    }));

  res.json({ ...group, members, coupons });
});

// POST /groups/:id/members — add a member (admin only)
router.post('/:id/members', async (req: AuthRequest, res: Response): Promise<void> => {
  const { identifier } = req.body;
  if (!identifier) {
    res.status(400).json({ error: 'identifier is required' });
    return;
  }

  const group = await db.getGroupById(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  if (group.admin_user_id !== req.userId!) {
    res.status(403).json({ error: 'Only the admin can add members' });
    return;
  }

  // Find user by email or username
  let target = await db.findUserByEmail(identifier);
  if (!target) {
    const results = await db.findUsersByQuery(identifier);
    target = results.find(u => u.username.toLowerCase() === identifier.toLowerCase()) ?? null;
  }
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (group.user_id_list.includes(target.user_id)) {
    res.status(409).json({ error: 'User is already a member' });
    return;
  }

  const updated = await db.addMemberToGroup(group.group_id, target.user_id);
  res.json(updated);
});

// DELETE /groups/:id/members/:userId — remove a member (admin only)
router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
  const group = await db.getGroupById(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  if (group.admin_user_id !== req.userId!) {
    res.status(403).json({ error: 'Only the admin can remove members' });
    return;
  }
  if (req.params.userId === group.admin_user_id) {
    res.status(400).json({ error: 'Cannot remove the admin from the group' });
    return;
  }

  // Remove the member's owned coupons from the group first
  await db.removeCouponsByOwnerFromGroup(group.group_id, req.params.userId);
  await db.removeMemberFromGroup(group.group_id, req.params.userId, req.userId!);
  res.status(204).send();
});

// POST /groups/:id/coupons/:couponId — share a coupon to a group
router.post('/:id/coupons/:couponId', async (req: AuthRequest, res: Response): Promise<void> => {
  const group = await db.getGroupById(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  if (!group.user_id_list.includes(req.userId!)) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const coupon = await db.getCouponById(req.params.couponId);
  if (!coupon) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  if (coupon.owner_id !== req.userId!) {
    res.status(403).json({ error: 'You do not own this coupon' });
    return;
  }

  const updated = await db.addCouponToGroup(group.group_id, coupon.coupon_id);
  res.json(updated);
});

// DELETE /groups/:id/coupons/:couponId — revoke a coupon from a group
router.delete('/:id/coupons/:couponId', async (req: AuthRequest, res: Response): Promise<void> => {
  const group = await db.getGroupById(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const coupon = await db.getCouponById(req.params.couponId);
  if (!coupon) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }

  const isAdmin = group.admin_user_id === req.userId!;
  const isOwner = coupon.owner_id === req.userId!;
  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: 'Only the admin or coupon owner can remove this coupon' });
    return;
  }

  await db.removeCouponFromGroup(group.group_id, coupon.coupon_id);
  res.status(204).send();
});

export default router;
