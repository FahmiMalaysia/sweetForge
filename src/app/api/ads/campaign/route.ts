import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import crypto from 'crypto';

// Must match src/lib/adsConfig.ts in the engine.
const AD_BATCH_VIEWS = 100;
const AD_COST_PER_BATCH = 8;
const AD_MAX_BATCHES = 10;

// POST /api/ads/campaign  { gameId, gameTitle, clicks }  (clicks = views, multiple of 100)
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { gameId, gameTitle, clicks, tagline, imageUrl } = await req.json();
  const adTagline = typeof tagline === 'string' && tagline.trim() ? tagline.trim().slice(0, 60) : null;
  // Only a cover-image path of a game THIS user owns is accepted.
  const imageMatch = typeof imageUrl === 'string'
    ? /^\/api\/games\/([A-Za-z0-9_.:-]+)\/[A-Za-z0-9_.:-]+\/header(\?v=\d+)?$/.exec(imageUrl)
    : null;
  const adImageUrl = imageMatch && imageMatch[1] === user.id ? imageUrl : null;
  if (!gameId || !gameTitle || !clicks) {
    return NextResponse.json({ error: 'Missing gameId, gameTitle, or clicks' }, { status: 400 });
  }
  const views = parseInt(clicks, 10);
  if (isNaN(views) || views < AD_BATCH_VIEWS || views % AD_BATCH_VIEWS !== 0 || views > AD_BATCH_VIEWS * AD_MAX_BATCHES) {
    return NextResponse.json(
      { error: `clicks must be a multiple of ${AD_BATCH_VIEWS}, up to ${AD_BATCH_VIEWS * AD_MAX_BATCHES}` },
      { status: 400 },
    );
  }

  const totalCost = (views / AD_BATCH_VIEWS) * AD_COST_PER_BATCH;
  const bal = await prisma.tokenBalance.findUnique({ where: { userId: user.id } });
  const balance = bal?.balance || 0;
  if (balance < totalCost) {
    return NextResponse.json({ error: 'Insufficient tokens', needed: totalCost, balance }, { status: 402 });
  }

  const campaignId = crypto.randomUUID();
  let newBalance: number;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      // Potong hanya jika baki masih cukup (atomik, tahan race dua permintaan serentak)
      const dec = await tx.tokenBalance.updateMany({
        where: { userId: user.id, balance: { gte: totalCost } },
        data: { balance: { decrement: totalCost } },
      });
      if (dec.count === 0) throw new Error('INSUFFICIENT_TOKENS');

      const after = await tx.tokenBalance.findUnique({ where: { userId: user.id } });
      await tx.tokenTransaction.create({
        data: { id: crypto.randomUUID(), userId: user.id, delta: -totalCost, reason: `ad_campaign:${campaignId}`, refId: gameId },
      });
      await tx.adCampaign.create({
        data: {
          id: campaignId,
          developerId: user.id,
          gameId,
          gameTitle,
          clicksPurchased: views,
          tokensPaid: totalCost,
          adTagline,
          adImageUrl,
        },
      });
      return after?.balance ?? 0;
    });
  } catch (e: any) {
    if (e?.message === 'INSUFFICIENT_TOKENS') {
      return NextResponse.json({ error: 'Insufficient tokens' }, { status: 402 });
    }
    throw e;
  }

  return NextResponse.json({
    campaignId, gameId, gameTitle,
    clicksPurchased: views,
    tokensPaid: totalCost,
    newBalance,
  }, { status: 201 });
}
