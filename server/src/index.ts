import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import couponsRouter from './routes/coupons';
import groupsRouter from './routes/groups';
import usersRouter from './routes/users';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRouter);
app.use('/coupons', couponsRouter);
app.use('/groups', groupsRouter);
app.use('/users', usersRouter);

app.listen(PORT, () => {
  console.log(`Cuplet server running on http://localhost:${PORT}`);
});
