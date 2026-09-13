import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../database/connection';

const JWT_SECRET = process.env.JWT_SECRET || 'debugging-contest-jwt-secret-change-in-production-32chars';

export interface AuthRequest extends Request {
  contestantId?: string;
  adminId?: string;
}

export function requireContestant(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.role !== 'contestant') {
      return res.status(403).json({ error: 'Access denied' });
    }
    req.contestantId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.adminToken || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}

/**
 * Verify that the authenticated contestant owns the given attempt.
 * Returns the attempt row or sends 403/404.
 */
export async function verifyAttemptOwnership(
  req: AuthRequest,
  res: Response,
  attemptId: string
): Promise<any | null> {
  const { rows } = await query(
    'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
    [attemptId, req.contestantId]
  );
  if (rows.length === 0) {
    res.status(403).json({ error: 'Access denied to this attempt' });
    return null;
  }
  return rows[0];
}
