import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import crypto from 'crypto';

// Token yang diterima developer HOST (game yang sedang dimainkan dan panggil play_ad).
const TOKENS_PER_AD_PLAY = 2;
// Pemain yang sama tak dikira berulang untuk kempen yang sama dalam tempoh ni.
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const GAME_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

// POST /api/ads/play  { campaignId, hostGameId }
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
    const completedNow = await prisma.$transaction(async (tx) => {
      // 1) Tambah klik secara atomik: hanya berjaya jika kempen masih aktif dan belum habis.
      const inc = await tx.adCampaign.updateMany({
        where: {
          id: campaign.id,
          status: 'active',
          clicksServed: { lt: campaign.clicksPurchased },
        },
        data: {
          clicksServed: { increment: 1 },
          tokensEarned: { increment: TOKENS_PER_AD_PLAY },
        },
      });
      if (inc.count === 0) throw new Error('CAMPAIGN_EXHAUSTED');

      // 2) Tanda kempen selesai bila klik dah cukup.
      const done = await tx.adCampaign.updateMany({
        where: { id: campaign.id, status: 'active', clicksServed: { gte: campaign.clicksPurchased } },
        data: { status: 'completed', completedAt: new Date() },
      });

      // 3) Kredit DEVELOPER HOST (bukan pembeli iklan).
      await tx.tokenBalance.upsert({
        where: { userId: hostDeveloperId },
        create: { userId: hostDeveloperId, balance: TOKENS_PER_AD_PLAY },
        update: { balance: { increment: TOKENS_PER_AD_PLAY } },
      });
      await tx.tokenTransaction.create({
        data: {
          id: crypto.randomUUID(),
          userId: hostDeveloperId,
          delta: TOKENS_PER_AD_PLAY,
          reason: `ad_play:${campaign.id}`,
          refId: hostGameId,
        },
      });

      // 4) Rekod tontonan. developerId = host (penerima), supaya pending-tokens betul.
      await tx.adPlay.create({
        data: {
          id: crypto.randomUUID(),
          campaignId: campaign.id,
          playerId: user.id,
          developerId: hostDeveloperId,
          tokensEarned: TOKENS_PER_AD_PLAY,
        },
      });

      // 5) Notifikasi host.
      await tx.notification.create({
        data: {
          id: crypto.randomUUID(),
          userId: hostDeveloperId,
          type: 'ad_play',
          title: 'Ad Played',
          message: `Game kau memainkan iklan "${campaign.gameTitle}". +${TOKENS_PER_AD_PLAY}T.`,
          refId: hostGameId,
        },
      });

      // 6) Kalau kempen selesai, beritahu pembeli.
      if (done.count > 0) {
        await tx.notification.create({
          data: {
            id: crypto.randomUUID(),
            userId: campaign.developerId,
            type: 'campaign_completed',
            title: 'Campaign Completed',
            message: `Kempen iklan "${campaign.gameTitle}" selesai.`,
            refId: campaign.id,
          },
        });
      }
      return done.count > 0;
    });

    return NextResponse.json({
      played: true,
      campaignId,
      hostGameId,
      hostEarned: TOKENS_PER_AD_PLAY,
      completed: completedNow,
    });
  } catch (e: any) {
    if (e?.message === 'CAMPAIGN_EXHAUSTED') {
      return NextResponse.json({ error: 'Campaign exhausted or completed' }, { status: 410 });
    }
    throw e;
  }
}
