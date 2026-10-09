import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// Must match AD_DURATION_SEC in the engine (src/lib/adsConfig.ts).
const AD_DURATION_SEC = 10;
const POOL_SIZE = 50;

function generateAdContent(gameTitle: string): string {
  const escaped = gameTitle
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { margin:0; padding:0; font-family:system-ui,sans-serif; background:#0a0a0a; color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; overflow:hidden; }
  .ad { text-align:center; padding:20px; max-width:400px; }
  .badge { display:inline-block; background:#f5a623; color:#000; font-size:9px; font-weight:900; padding:2px 8px; border-radius:2px; letter-spacing:1px; margin-bottom:12px; text-transform:uppercase; }
  .title { font-size:20px; font-weight:800; margin:0 0 8px; color:#fff; }
  .sub { font-size:12px; color:#888; margin:0 0 16px; }
  .tag { display:inline-block; color:#888; font-size:11px; }
  .footer { position:fixed; bottom:8px; right:8px; font-size:9px; color:#444; }
</style>
</head>
<body>
  <div class="ad">
    <span class="badge">Ad</span>
    <h1 class="title">${escaped}</h1>
    <p class="sub">Sponsored game on SweetForge</p>
    <span class="tag">Use Remind me below to save this game</span>
  </div>
  <div class="footer">SweetForge Ads · ${AD_DURATION_SEC}s</div>
</body>
</html>`;
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
      adContent: generateAdContent(campaign.gameTitle),
      durationSec: AD_DURATION_SEC,
    },
  });
}
