import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import crypto from 'crypto';

const TOKENS_PER_AD_PLAY = 2;

// POST /api/ads/play
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { campaignId } = await req.json();
  if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 });

  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.status !== 'active' || campaign.clicksServed >= campaign.clicksPurchased) {
    return NextResponse.json({ error: 'Campaign exhausted or completed' }, { status: 410 });
  }

  await prisma.$transaction(async (tx) => {
    // Increment campaign
    const newServed = campaign.clicksServed + 1;
    const isCompleted = newServed >= campaign.clicksPurchased;
    await tx.adCampaign.update({
      where: { id: campaign.id },
      data: {
        clicksServed: newServed,
        tokensEarned: campaign.tokensEarned + TOKENS_PER_AD_PLAY,
        status: isCompleted ? 'completed' : 'active',
        completedAt: isCompleted ? new Date() : null,
      },
    });

    // Award dev tokens
    const devBal = await tx.tokenBalance.findUnique({ where: { userId: campaign.developerId } });
    const devBalance = (devBal?.balance || 0) + TOKENS_PER_AD_PLAY;
    await tx.tokenBalance.upsert({
      where: { userId: campaign.developerId },
      create: { userId: campaign.developerId, balance: devBalance },
      update: { balance: devBalance },
    });
    await tx.tokenTransaction.create({
      data: { id: crypto.randomUUID(), userId: campaign.developerId, delta: TOKENS_PER_AD_PLAY, reason: `ad_play:${campaign.id}`, refId: campaign.gameId },
    });

    // Log ad play
    await tx.adPlay.create({
      data: { id: crypto.randomUUID(), campaignId: campaign.id, playerId: user.id, developerId: campaign.developerId, tokensEarned: TOKENS_PER_AD_PLAY },
    });

    // Send notification to developer
    await tx.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId: campaign.developerId,
        type: 'ad_play',
        title: 'Ad Played',
        message: `A player played your ad for "${campaign.gameTitle}". +${TOKENS_PER_AD_PLAY}T pending.`,
        refId: campaign.gameId,
      },
    });

    // Campaign completed notification
    if (isCompleted) {
      await tx.notification.create({
        data: {
          id: crypto.randomUUID(),
          userId: campaign.developerId,
          type: 'campaign_completed',
          title: 'Campaign Completed',
          message: `Your ad campaign for "${campaign.gameTitle}" has completed. ${newServed}/${campaign.clicksPurchased} clicks served.`,
          refId: campaign.id,
        },
      });
    }
  });

  return NextResponse.json({ played: true, campaignId, developerEarned: TOKENS_PER_AD_PLAY });
}
