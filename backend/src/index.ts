import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth';
import contestRoutes from './routes/contest';
import questionRoutes from './routes/questions';
import answerRoutes from './routes/answers';
import securityRoutes from './routes/security';
import adminRoutes from './routes/admin';
import { apiLimiter } from './middleware/rateLimiter';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // CSP is handled by the frontend
}));

// CORS — allow frontend origin only
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:5174',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));
app.use(cookieParser());
app.use(apiLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/contest', contestRoutes);
app.use('/api/contest/questions', questionRoutes);
app.use('/api/contest/questions', answerRoutes);
app.use('/api/contest', securityRoutes);
app.use('/api/admin', adminRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler — never expose stack traces to clients
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  });
}

export default app;
