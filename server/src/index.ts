import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import couponsRouter from './routes/coupons';
import groupsRouter from './routes/groups';
import invitationsRouter from './routes/invitations';
import usersRouter from './routes/users';
import notificationsRouter from './routes/notifications';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRouter);
app.use('/coupons', couponsRouter);
app.use('/groups', groupsRouter);
app.use('/invitations', invitationsRouter);
app.use('/users', usersRouter);
app.use('/notifications', notificationsRouter);

app.listen(PORT, () => {
  console.log(`Cuplet server running on http://localhost:${PORT}`);
});
