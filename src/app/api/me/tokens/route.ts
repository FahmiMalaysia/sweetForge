import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// GET /api/me/tokens
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const bal = await prisma.tokenBalance.findUnique({ where: { userId: user.id } });
  const balance = bal?.balance || 0;

  const recentTx = await prisma.tokenTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ balance, recentTransactions: recentTx });
}
