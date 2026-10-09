import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import crypto from 'crypto';

// Must match src/lib/adsConfig.ts in the engine.
const AD_HOST_PAYOUT_EVERY = 20; // developer dapat token setiap 20 tontonan
const AD_HOST_PAYOUT_TOKENS = 1;

// Pemain yang sama tak dikira berulang untuk kempen yang sama dalam tempoh ni.
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const GAME_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

// POST /api/ads/play  { campaignId, hostGameId }
// Developer host dapat AD_HOST_PAYOUT_TOKENS token setiap AD_HOST_PAYOUT_EVERY tontonan
// yang dikira untuk game dia. Pembayaran integer, tiada pecahan.
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId : '';
  const hostGameId = typeof body.hostGameId === 'string' ? body.hostGameId : '';
  if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 });
  if (!GAME_ID_RE.test(hostGameId)) {
    return NextResponse.json({ error: 'hostGameId required (game yang sedang dimainkan)' }, { status: 400 });
  }

  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.status !== 'active' || campaign.clicksServed >= campaign.clicksPurchased) {
    return NextResponse.json({ error: 'Campaign exhausted or completed' }, { status: 410 });
  }

  // Game tak boleh iklankan dirinya sendiri.
  if (hostGameId === campaign.gameId) {
    return NextResponse.json({ error: 'Ad cannot be shown on its own game' }, { status: 400 });
  }

  // Host mesti game yang dah publish. Developer host = pemilik meta game tu.
  const hostMeta = await prisma.object.findFirst({
    where: { key: `games/${hostGameId}.meta.json` },
    select: { userId: true },
  });
  if (!hostMeta) return NextResponse.json({ error: 'Host game not found' }, { status: 404 });
  const hostDeveloperId = hostMeta.userId;

  // Dedupe: pemain yang sama tak boleh kira berulang untuk kempen yang sama.
  const recent = await prisma.adPlay.count({
    where: {
      campaignId: campaign.id,
      playerId: user.id,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
  });
  if (recent > 0) {
    return NextResponse.json({ played: false, reason: 'already-counted' }, { status: 200 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) Tambah tontonan secara atomik: hanya berjaya jika kempen masih aktif dan belum habis.
      const inc = await tx.adCampaign.updateMany({
        where: {
          id: campaign.id,
          status: 'active',
          clicksServed: { lt: campaign.clicksPurchased },
        },
        data: { clicksServed: { increment: 1 } },
      });
      if (inc.count === 0) throw new Error('CAMPAIGN_EXHAUSTED');

      // 2) Kira tontonan untuk developer host (termasuk yang ini), kemudian tentukan bayaran.
      const priorPlays = await tx.adPlay.count({ where: { developerId: hostDeveloperId } });
      const hostCredit = (priorPlays + 1) % AD_HOST_PAYOUT_EVERY === 0 ? AD_HOST_PAYOUT_TOKENS : 0;

      // 3) Rekod tontonan ini. tokensEarned = bayaran yang dibuat untuk tontonan ni (0 atau 2).
      await tx.adPlay.create({
        data: {
          id: crypto.randomUUID(),
          campaignId: campaign.id,
          playerId: user.id,
          developerId: hostDeveloperId,
          tokensEarned: hostCredit,
        },
      });

      if (hostCredit > 0) {
        await tx.tokenBalance.upsert({
          where: { userId: hostDeveloperId },
          create: { userId: hostDeveloperId, balance: hostCredit },
          update: { balance: { increment: hostCredit } },
        });
        await tx.tokenTransaction.create({
          data: {
            id: crypto.randomUUID(),
            userId: hostDeveloperId,
            delta: hostCredit,
            reason: `ad_play_batch:${hostGameId}`,
            refId: hostGameId,
          },
        });
        await tx.adCampaign.update({
          where: { id: campaign.id },
          data: { tokensEarned: { increment: hostCredit } },
        });
        await tx.notification.create({
          data: {
            id: crypto.randomUUID(),
            userId: hostDeveloperId,
            type: 'ad_play',
            title: 'Ad Views Milestone',
            message: `Your game reached ${AD_HOST_PAYOUT_EVERY} more ad views. +${hostCredit}T.`,
            refId: hostGameId,
          },
        });
      }

      // 5) Tanda kempen selesai bila tontonan dah cukup.
      const done = await tx.adCampaign.updateMany({
        where: { id: campaign.id, status: 'active', clicksServed: { gte: campaign.clicksPurchased } },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (done.count > 0) {
        await tx.notification.create({
          data: {
            id: crypto.randomUUID(),
            userId: campaign.developerId,
            type: 'campaign_completed',
            title: 'Campaign Completed',
            message: `Your ad campaign for "${campaign.gameTitle}" has completed.`,
            refId: campaign.id,
          },
        });
      }

      return { hostCredit, completed: done.count > 0 };
    });

    return NextResponse.json({
      played: true,
      campaignId,
      hostGameId,
      hostEarned: result.hostCredit,
      completed: result.completed,
    });
  } catch (e: any) {
    if (e?.message === 'CAMPAIGN_EXHAUSTED') {
      return NextResponse.json({ error: 'Campaign exhausted or completed' }, { status: 410 });
    }
    throw e;
  }
}
