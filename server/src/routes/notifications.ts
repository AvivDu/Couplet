import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getNotificationsForUser, markAllNotificationsRead, deleteNotification } from '../repositories/notifications';

const router = Router();
router.use(authMiddleware);

// GET /notifications
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const notifications = await getNotificationsForUser(req.userId!);
  res.json(notifications);
});

// PATCH /notifications/read-all
router.patch('/read-all', async (req: AuthRequest, res: Response): Promise<void> => {
  await markAllNotificationsRead(req.userId!);
  res.status(204).send();
});

// DELETE /notifications/:notificationId
router.delete('/:notificationId', async (req: AuthRequest, res: Response): Promise<void> => {
  await deleteNotification(req.userId!, req.params.notificationId);
  res.status(204).send();
});

export default router;
