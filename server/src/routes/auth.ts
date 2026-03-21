import { Router, Response } from 'express';
import { db } from '../db';
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

  const existing = await db.findUserById(req.userId!);
  if (existing) {
    // Already synced (e.g. re-registration attempt) — return existing record
    res.json({ userId: existing.user_id, username: existing.username, email: existing.email });
    return;
  }

  await db.insertUser({
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
  const user = await db.findUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ userId: user.user_id, username: user.username, email: user.email });
});

export default router;
