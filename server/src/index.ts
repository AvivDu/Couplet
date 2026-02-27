import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import couponsRouter from './routes/coupons';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRouter);
app.use('/coupons', couponsRouter);

app.listen(PORT, () => {
  console.log(`Cuplet server running on http://localhost:${PORT}`);
});
