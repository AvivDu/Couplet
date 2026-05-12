import { Router, Response } from 'express';
import { getGroupsWithPendingMember } from '../repositories/groups';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /invitations — pending group invitations for current user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const groups = await getGroupsWithPendingMember(req.userId!);
  const invitations = groups.map(g => ({
    group_id: g.group_id,
    name: g.name,
    admin_user_id: g.admin_user_id,
  }));
  res.json(invitations);
});

export default router;
