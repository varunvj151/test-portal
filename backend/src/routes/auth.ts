import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../database/connection';
import { loginLimiter } from '../middleware/rateLimiter';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'debugging-contest-jwt-secret-change-in-production-32chars';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { registration_number, password } = req.body;

    if (!registration_number || !password) {
      return res.status(400).json({ error: 'Registration number and password are required' });
    }

    const { rows } = await query(
      'SELECT * FROM contestants WHERE registration_number = $1',
      [String(registration_number).trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid registration number or password' });
    }

    const contestant = rows[0];

    if (!contestant.is_active) {
      return res.status(403).json({ error: 'Account is inactive. Contact the administrator.' });
    }

    const validPassword = await bcrypt.compare(String(password), contestant.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid registration number or password' });
    }

    const token = jwt.sign(
      { sub: contestant.id, role: 'contestant', reg: contestant.registration_number },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as any
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    return res.json({
      message: 'Login successful',
      contestant: {
        id: contestant.id,
        registration_number: contestant.registration_number,
        name: contestant.name,
        department: contestant.department,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.role !== 'contestant') return res.status(403).json({ error: 'Access denied' });

    const { rows } = await query(
      'SELECT id, registration_number, name, department FROM contestants WHERE id = $1',
      [payload.sub]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Contestant not found' });

    return res.json({ contestant: rows[0] });
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
});

// POST /api/admin/login
router.post('/admin/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { rows } = await query('SELECT * FROM admins WHERE username = $1', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = rows[0];
    if (!admin.is_active) {
      return res.status(403).json({ error: 'Admin account is inactive' });
    }

    const valid = await bcrypt.compare(String(password), admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { sub: admin.id, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '12h' } as any
    );

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 12 * 60 * 60 * 1000,
    });

    return res.json({ message: 'Admin login successful' });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/logout
router.post('/admin/logout', (req: Request, res: Response) => {
  res.clearCookie('adminToken', { httpOnly: true, sameSite: 'strict' });
  return res.json({ message: 'Logged out' });
});

export default router;
