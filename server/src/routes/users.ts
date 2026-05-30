import { Router, Response } from 'express';
import { findUsersByQuery, findUsersByPhones } from '../repositories/users';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /users/search?q=<query> — search users by email, username, or phone number
router.get('/search', async (req: AuthRequest, res: Response): Promise<void> => {
  const q = (req.query.q as string ?? '').trim();
  if (!q) {
    res.json([]);
    return;
  }

  const users = await findUsersByQuery(q);
  const results = users
    .filter(u => u.user_id !== req.userId!)
    .map(u => ({ user_id: u.user_id, username: u.username, email: u.email, phone_number: u.phone_number }));

  res.json(results);
});

// POST /users/match-contacts — bulk phone lookup, returns Couplet users matching input phones
router.post('/match-contacts', async (req: AuthRequest, res: Response): Promise<void> => {
  const phones: string[] = req.body.phones ?? [];
  if (!Array.isArray(phones) || phones.length === 0) {
    res.status(400).json({ error: 'phones array is required' }); return;
  }
  const matched = await findUsersByPhones(phones);
  res.json(
    matched
      .filter(u => u.user_id !== req.userId)
      .map(u => ({ user_id: u.user_id, username: u.username, email: u.email, phone_number: u.phone_number! }))
  );
});

export default router;
