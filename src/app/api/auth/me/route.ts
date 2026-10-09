import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { getAuthUserId } from '@/lib/server/auth';

export async function GET(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const bal = await prisma.tokenBalance.findUnique({ where: { userId: user.id } });
  const tokens = bal?.balance || 0;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      isAnonymous: user.isAnonymous,
      storageQuota: user.storageQuota,
      storageUsed: user.storageUsed,
      tokens,
      createdAt: Math.floor(user.createdAt.getTime() / 1000),
      lastLoginAt: user.lastLoginAt ? Math.floor(user.lastLoginAt.getTime() / 1000) : null,
    },
  });
}
