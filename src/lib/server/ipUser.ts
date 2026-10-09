/**
 * lib/server/ipUser.ts — IP-based anonymous user detection for Vercel
 *
 * Vercel serverless functions get client IP from request headers.
 * We use x-vercel-forwarded-for (Vercel) or x-forwarded-for (general proxy).
 *
 * Same IP always maps to same user ID → storage persists across sessions.
 */
import { prisma } from './db';

const USER_QUOTA = parseInt(process.env.USER_QUOTA_BYTES || '10485760', 10);

export function getClientIp(req: Request): string {
  // Vercel sets x-vercel-forwarded-for
  const xff = req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

export function ipToUserId(ip: string): string {
  const hash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
  return `ip_${hash}`;
}

import crypto from 'crypto';

/**
 * Get or create anonymous user for the request's IP.
 */
export async function getOrCreateIpUser(req: Request) {
  const ip = getClientIp(req);
  const userId = ipToUserId(ip);

  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@anonymous.local`,
        username: userId,
        passwordHash: '!',
        displayName: 'Guest',
        storageQuota: USER_QUOTA,
        isAnonymous: true,
        sourceIp: ip,
      },
    });
  }
  return user;
}

/**
 * Resolve user: JWT first, fallback to IP-based anonymous.
 */
export async function resolveUser(req: Request, authUserId: string | null) {
  if (authUserId) {
    const user = await prisma.user.findUnique({ where: { id: authUserId } });
    if (user) return user;
  }
  if (process.env.DISABLE_ANONYMOUS === 'true') return null;
  return getOrCreateIpUser(req);
}
