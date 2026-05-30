import { Router, Request, Response } from 'express';
import { findUserById, findUserByPhone, insertUser } from '../repositories/users';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// PUBLIC (no auth) — the caller isn't logged in yet.
// Resolves a phone number to its account email. Serves two flows:
//   1. Login by phone: client looks up the email, then signs into Cognito with it.
//   2. Registration pre-check: a 200 here means the phone is already taken.
router.get('/resolve', async (req: Request, res: Response): Promise<void> => {
  const phone = (req.query.phone as string ?? '').trim();
  if (!phone) {
    res.status(400).json({ error: 'phone is required' });
    return;
  }

  const user = await findUserByPhone(phone);
  if (!user) {
    res.status(404).json({ error: 'No account found for that phone number' });
    return;
  }

  res.json({ email: user.email });
});

// Called by the client immediately after Cognito registration.
// The client already has a valid Cognito access token at this point.
// We create the user metadata record in our DB using the verified sub as user_id.
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, username, phone_number } = req.body;

  if (!email || !username || !phone_number) {
    res.status(400).json({ error: 'email, username and phone_number are required' });
    return;
  }

  const existing = await findUserById(req.userId!);
  if (existing) {
    // Already synced (e.g. re-registration attempt) — return existing record
    res.json({
      userId: existing.user_id,
      username: existing.username,
      email: existing.email,
      phone_number: existing.phone_number,
    });
    return;
  }

  await insertUser({
    user_id: req.userId!,
    email,
    username,
    phone_number,
    password_hash: '',
    created_at: new Date().toISOString(),
  });

  res.status(201).json({ userId: req.userId!, username, email, phone_number });
});

// Called by the client after Cognito login to fetch user metadata from our DB.
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await findUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    userId: user.user_id,
    username: user.username,
    email: user.email,
    phone_number: user.phone_number,
  });
});

export default router;
