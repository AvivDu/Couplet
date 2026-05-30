import { Router, Response } from 'express';
import { findUsersByQuery } from '../repositories/users';
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

export default router;
