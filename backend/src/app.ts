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

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // CSP is handled by the frontend
}));

// CORS — allow frontend origin and preview environments
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // Allow configured origins or any vercel.app preview domain
    const isVercel = origin.endsWith('.vercel.app');
    const isExplicit = allowedOrigins.some(o => origin.startsWith(o));
    if (isVercel || isExplicit || process.env.NODE_ENV !== 'production') {
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

// Health checks
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
};

app.get('/api/health', healthHandler);
app.get('/health', healthHandler);

// API Routes (mounted under both /api/* and /* for rewrite resilience)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/contest/questions', questionRoutes);
app.use('/contest/questions', questionRoutes);

app.use('/api/contest/questions', answerRoutes);
app.use('/contest/questions', answerRoutes);

app.use('/api/contest', securityRoutes);
app.use('/contest', securityRoutes);

app.use('/api/contest', contestRoutes);
app.use('/contest', contestRoutes);

app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);

// 404 handler for API routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Central error handler — never expose stack traces to clients
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
