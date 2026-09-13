import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Check current directory first, then fallback to backend/.env
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../backend/.env') });

declare global {
  var _pgPool: Pool | undefined;
}

const rawConnectionString = process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * Normalizes connection strings, safely URL-encoding passwords containing special characters (like '@').
 */
function sanitizeDatabaseUrl(url: string): string {
  try {
    const protocolMatch = url.match(/^([^:]+):\/\//);
    if (!protocolMatch) return url;
    const protocol = protocolMatch[0];
    const rest = url.slice(protocol.length);
    const lastAtIndex = rest.lastIndexOf('@');
    if (lastAtIndex === -1) return url;

    const authPart = rest.slice(0, lastAtIndex);
    const hostPart = rest.slice(lastAtIndex + 1);

    const colonIndex = authPart.indexOf(':');
    if (colonIndex === -1) return url;

    const username = authPart.slice(0, colonIndex);
    const password = authPart.slice(colonIndex + 1);

    // If password contains raw characters needing encoding
    const encodedPassword = decodeURIComponent(password) === password
      ? encodeURIComponent(password)
      : password;

    return `${protocol}${username}:${encodedPassword}@${hostPart}`;
  } catch {
    return url;
  }
}

const connectionString = sanitizeDatabaseUrl(rawConnectionString);

const isSupabase =
  connectionString.includes('supabase.co') ||
  connectionString.includes('pooler.supabase.com');

const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL === '1' ||
  Boolean(process.env.VERCEL);

const poolConfig: PoolConfig = {
  connectionString,
  ssl: (isSupabase || isProduction || process.env.DATABASE_SSL === 'true')
    ? { rejectUnauthorized: false }
    : false,
  // Low connection ceiling for serverless functions to avoid connection exhaustion on Supabase
  max: parseInt(
    process.env.PG_MAX_POOL || (process.env.VERCEL ? '2' : '10'),
    10
  ),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 20000,
};

// Reuse pool across warm serverless invocations
export const pool: Pool = global._pgPool || new Pool(poolConfig);

if (!global._pgPool) {
  global._pgPool = pool;
}

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number | null }> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development' && duration > 1000) {
    console.warn(`Slow query (${duration}ms):`, text.slice(0, 100));
  }
  return result;
}
