import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// Must match src/lib/adsConfig.ts and src/lib/adCreative.ts in the engine.
const AD_DURATION_SEC = 10;
const POOL_SIZE = 50;
const PALETTE = ['#4a90e2', '#f5a623', '#2da04a', '#e25a8f', '#8e6cf0', '#27b5b0'];
const STYLES = ['sweep', 'zoom', 'pulse'] as const;
const TAGLINE = 'Play it on SweetForge';

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * The server sends DATA only (~100 bytes). The engine draws the animated ad.
 * No HTML, no image, no video is sent, so this costs almost no bandwidth.
 */
function buildCreative(gameId: string, gameTitle: string, tagline: string | null) {
  const h = hash(gameId);
  return {
    title: gameTitle.slice(0, 40),
    tagline: tagline && tagline.trim() ? tagline.trim().slice(0, 60) : TAGLINE,
    accent: PALETTE[h % PALETTE.length],
    style: STYLES[h % STYLES.length],
  };
}

// GET /api/ads/next?exclude=id1,id2
// Rotation: campaigns the device saw recently are skipped when possible, and
// among the rest one is picked at random, weighted by remaining views.
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const excludeRaw = new URL(req.url).searchParams.get('exclude') || '';
  const exclude = excludeRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);

  const pool = await prisma.adCampaign.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
    take: POOL_SIZE,
  });
  const available = pool.filter((c) => c.clicksServed < c.clicksPurchased);
  if (available.length === 0) return NextResponse.json({ hasAd: false });

  const fresh = available.filter((c) => !exclude.includes(c.id));
  const candidates = fresh.length > 0 ? fresh : available;

  // Weighted random: campaigns with more remaining views are shown more often.
  const weights = candidates.map((c) => c.clicksPurchased - c.clicksServed);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let campaign = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) { campaign = candidates[i]; break; }
  }

  return NextResponse.json({
    hasAd: true,
    campaign: {
      campaignId: campaign.id,
      gameId: campaign.gameId,
      gameTitle: campaign.gameTitle,
      creative: {
        ...buildCreative(campaign.gameId, campaign.gameTitle, campaign.adTagline),
        imageUrl: campaign.adImageUrl || null,
      },
      durationSec: AD_DURATION_SEC,
    },
  });
}
