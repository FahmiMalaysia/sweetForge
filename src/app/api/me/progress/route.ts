import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import { computeProgress } from '@/lib/server/progress';

// GET /api/me/progress
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const progress = await computeProgress(user.id);
  const claimableCount = progress.filter(p => p.claimable).length;

  return NextResponse.json({
    progress,
    claimableCount,
    hasClaimable: claimableCount > 0,
  });
}
