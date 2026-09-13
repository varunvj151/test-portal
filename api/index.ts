import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../backend/src/app';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Normalize rewrites: if Vercel routed to /api, recover original path
  if (req.url === '/api' || req.url === '/api/') {
    const original = (req.headers['x-matched-path'] ||
      req.headers['x-forwarded-uri'] ||
      req.headers['x-vercel-original-uri']) as string | undefined;

    if (original) {
      req.url = original;
    }
  }
  return (app as any)(req, res);
}
