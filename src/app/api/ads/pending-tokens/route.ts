import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// GET /api/ads/pending-tokens
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const oneMinAgo = new Date(Date.now() - 60 * 1000);
  const result = await prisma.adPlay.aggregate({
    where: { developerId: user.id, createdAt: { gte: oneMinAgo } },
    _sum: { tokensEarned: true },
  });
  const pending = result._sum.tokensEarned || 0;

  const totalPlays = await prisma.adPlay.count({ where: { developerId: user.id } });

  return NextResponse.json({ pendingTokens: pending, windowSec: 60, totalAdPlays: totalPlays });
}
