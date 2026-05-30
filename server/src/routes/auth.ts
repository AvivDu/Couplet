import { Router, Request, Response } from 'express';
import { findUserById, findUserByPhone, insertUser, updateUserById } from '../repositories/users';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Called by the client immediately after Cognito registration.
// The client already has a valid Cognito access token at this point.
// We create the user metadata record in our DB using the verified sub as user_id.
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, username } = req.body;

  if (!email || !username) {
    res.status(400).json({ error: 'email and username are required' });
    return;
  }

  const existing = await findUserById(req.userId!);
  if (existing) {
    // Already synced (e.g. re-registration attempt) — return existing record
    res.json({ userId: existing.user_id, username: existing.username, email: existing.email });
    return;
  }

  await insertUser({
    user_id: req.userId!,
    email,
    username,
    password_hash: '',
    created_at: new Date().toISOString(),
  });

  res.status(201).json({ userId: req.userId!, username, email });
});

// Called by the client after Cognito login to fetch user metadata from our DB.
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await findUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ userId: user.user_id, username: user.username, email: user.email, phone_number: user.phone_number });
});

// Resolve a phone number to an email (public — no auth required).
router.get('/resolve', async (req: Request, res: Response): Promise<void> => {
  const phone = (req.query.phone as string ?? '').trim();
  if (!phone) { res.status(400).json({ error: 'phone is required' }); return; }
  const user = await findUserByPhone(phone);
  if (!user) { res.status(404).json({ error: 'No account found for that phone number' }); return; }
  res.json({ email: user.email });
});

// Update the authenticated user's profile fields.
router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { username, phone_number } = req.body;
  if (phone_number) {
    const taken = await findUserByPhone(phone_number);
    if (taken && taken.user_id !== req.userId) {
      res.status(409).json({ error: 'That phone number is already in use.' }); return;
    }
  }
  const updated = await updateUserById(req.userId!, { username, phone_number });
  if (!updated) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ userId: updated.user_id, username: updated.username, email: updated.email, phone_number: updated.phone_number });
});

export default router;
