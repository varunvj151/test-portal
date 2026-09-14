import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// Key login limiter by student registration number or admin username so 100+ students on the same lab IP aren't blocked
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per student/admin identifier
  keyGenerator: (req: Request): string => {
    const regNo = req.body?.registration_number?.toString()?.trim()?.toUpperCase();
    if (regNo) return `login_reg_${regNo}`;
    const username = req.body?.username?.toString()?.trim()?.toLowerCase();
    if (username) return `login_admin_${username}`;
    return req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown_ip';
  },
  message: { error: 'Too many login attempts for this account. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Key general API limiter by authenticated student session token, with a high shared-IP ceiling for lab NAT
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 requests/min per student (or shared lab IP pool)
  keyGenerator: (req: Request): string => {
    const cookieToken = req.cookies?.contest_token;
    if (cookieToken) return `auth_${cookieToken.slice(-16)}`;
    const authHeader = req.headers?.authorization;
    if (authHeader) return `bearer_${authHeader.slice(-16)}`;
    return req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown_ip';
  },
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

