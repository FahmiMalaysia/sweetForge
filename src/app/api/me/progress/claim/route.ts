import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import { REWARDS, computeProgress } from '@/lib/server/progress';
import crypto from 'crypto';

// POST /api/me/progress/claim
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { rewardId } = await req.json();
  if (!rewardId) return NextResponse.json({ error: 'Missing rewardId' }, { status: 400 });

  const reward = REWARDS.find(r => r.id === rewardId);
  if (!reward) return NextResponse.json({ error: 'Unknown reward' }, { status: 404 });

  const claimed = await prisma.claimedReward.findUnique({
    where: { userId_rewardId: { userId: user.id, rewardId } },
  });
  if (claimed) return NextResponse.json({ error: 'Already claimed' }, { status: 409 });

  const progress = await computeProgress(user.id);
  const p = progress.find(x => x.id === rewardId);
  if (!p || !p.completed) {
    return NextResponse.json({ error: 'Requirement not met', current: p?.current || 0, target: reward.target }, { status: 403 });
  }

  // Atomic: claim + award tokens
  const newBalance = await prisma.$transaction(async (tx) => {
    await tx.claimedReward.create({
      data: { id: crypto.randomUUID(), userId: user.id, rewardId, tokensAwarded: reward.tokens },
    });

    const bal = await tx.tokenBalance.findUnique({ where: { userId: user.id } });
    const currentBalance = bal?.balance || 0;
    const newBal = currentBalance + reward.tokens;
    await tx.tokenBalance.upsert({
      where: { userId: user.id },
      create: { userId: user.id, balance: newBal },
      update: { balance: newBal },
    });
    await tx.tokenTransaction.create({
      data: { id: crypto.randomUUID(), userId: user.id, delta: reward.tokens, reason: `reward:${rewardId}` },
    });
    return newBal;
  });

  return NextResponse.json({ claimed: true, rewardId, tokensAwarded: reward.tokens, newBalance });
}
