import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

const USER_QUOTA = parseInt(process.env.USER_QUOTA_BYTES || '10485760', 10);

// POST /api/v1/users — register/auto-create user
// For anonymous (IP-based) users: always use their IP-derived ID (ignore body.userId)
// For logged-in users: use body.userId if provided, else their own ID
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  // For anonymous users, always use their IP-derived ID
  // (client may send "default-user" but we ignore it)
  const body = await req.json().catch(() => ({} as any));
  const targetUserId = user.isAnonymous ? user.id : (body.userId || user.id);

  // If user already exists, return 200 (not 409) — idempotent for ensureUser() pattern
  const existing = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (existing) {
    return NextResponse.json({ userId: targetUserId, quotaBytes: existing.storageQuota, alreadyExists: true }, { status: 200 });
  }

  // This shouldn't happen often (resolveUser already creates anonymous users),
  // but handle it just in case
  return NextResponse.json({ userId: targetUserId, quotaBytes: user.storageQuota, alreadyExists: true }, { status: 200 });
}
