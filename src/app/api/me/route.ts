import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// GET /api/me — current user state
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const bal = await prisma.tokenBalance.findUnique({ where: { userId: user.id } });
  const tokens = bal?.balance || 0;

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isAnonymous: user.isAnonymous,
      email: user.isAnonymous ? null : user.email,
      createdAt: Math.floor(user.createdAt.getTime() / 1000),
      lastLoginAt: user.lastLoginAt ? Math.floor(user.lastLoginAt.getTime() / 1000) : null,
    },
    storage: {
      quota: user.storageQuota,
      used: user.storageUsed,
      free: Math.max(0, user.storageQuota - user.storageUsed),
    },
    tokens,
  });
}
