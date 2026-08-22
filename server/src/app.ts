import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import couponsRouter from './routes/coupons';
import groupsRouter from './routes/groups';
import invitationsRouter from './routes/invitations';
import usersRouter from './routes/users';
import notificationsRouter from './routes/notifications';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRouter);
app.use('/coupons', couponsRouter);
app.use('/groups', groupsRouter);
app.use('/invitations', invitationsRouter);
app.use('/users', usersRouter);
app.use('/notifications', notificationsRouter);

// Express 4 does not catch rejections from async route handlers: an unhandled
// one leaves the request hanging with no response and no log, which makes any
// server-side throw invisible from the client. Log it and answer with a 500.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err?.stack ?? err);
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message ?? 'Internal server error' });
});

export default app;
