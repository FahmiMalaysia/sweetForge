/**
 * lib/server/auth.ts — JWT helpers for Next.js API routes
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(user: { id: string; email: string; username: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as any }
  );
}

export function verifyToken(token: string): { sub: string; email: string; username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

export function extractToken(req: NextRequest): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : h.trim();
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/**
 * Get authenticated user ID from request (JWT), or null if not logged in.
 */
export function getAuthUserId(req: NextRequest): string | null {
  const token = extractToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  return payload?.sub || null;
}
