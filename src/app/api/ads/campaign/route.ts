import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import crypto from 'crypto';

const TOKENS_PER_CLICK_COST = 4;
const TOKENS_PER_AD_PLAY = 2;

// POST /api/ads/campaign
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { gameId, gameTitle, clicks } = await req.json();
  if (!gameId || !gameTitle || !clicks) {
    return NextResponse.json({ error: 'Missing gameId, gameTitle, or clicks' }, { status: 400 });
  }
  const clickCount = parseInt(clicks, 10);
  if (isNaN(clickCount) || clickCount < 1 || clickCount > 1000) {
    return NextResponse.json({ error: 'clicks must be 1-1000' }, { status: 400 });
  }

  const totalCost = clickCount * TOKENS_PER_CLICK_COST;
  const bal = await prisma.tokenBalance.findUnique({ where: { userId: user.id } });
  const balance = bal?.balance || 0;
  if (balance < totalCost) {
    return NextResponse.json({ error: 'Insufficient tokens', needed: totalCost, balance }, { status: 402 });
  }

  const campaignId = crypto.randomUUID();
  const newBalance = await prisma.$transaction(async (tx) => {
    await tx.tokenBalance.upsert({
      where: { userId: user.id },
      create: { userId: user.id, balance: balance - totalCost },
      update: { balance: balance - totalCost },
    });
    await tx.tokenTransaction.create({
      data: { id: crypto.randomUUID(), userId: user.id, delta: -totalCost, reason: `ad_campaign:${campaignId}`, refId: gameId },
    });
    await tx.adCampaign.create({
      data: {
        id: campaignId,
        developerId: user.id,
        gameId,
        gameTitle,
        clicksPurchased: clickCount,
        tokensPaid: totalCost,
      },
    });
    return balance - totalCost;
  });

  return NextResponse.json({
    campaignId, gameId, gameTitle,
    clicksPurchased: clickCount,
    tokensPaid: totalCost,
    newBalance,
  }, { status: 201 });
}
