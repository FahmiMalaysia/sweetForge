import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

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
  .play-btn { display:inline-block; background:#4a90e2; color:#fff; padding:10px 24px; border-radius:4px; font-size:12px; font-weight:700; text-decoration:none; }
  .footer { position:fixed; bottom:8px; right:8px; font-size:9px; color:#444; }
</style>
</head>
<body>
  <div class="ad">
    <span class="badge">Ad</span>
    <h1 class="title">${escaped}</h1>
    <p class="sub">Try this game on SweetForge</p>
    <a href="#" class="play-btn">Play Now</a>
  </div>
  <div class="footer">SweetForge Ads · 5s</div>
</body>
</html>`;
}

// GET /api/ads/next
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const campaign = await prisma.adCampaign.findFirst({
    where: { status: 'active', clicksServed: { lt: prisma.adCampaign.fields.clicksPurchased } },
    orderBy: { createdAt: 'asc' },
  });

  if (!campaign) return NextResponse.json({ hasAd: false });

  return NextResponse.json({
    hasAd: true,
    campaign: {
      campaignId: campaign.id,
      gameId: campaign.gameId,
      gameTitle: campaign.gameTitle,
      adContent: generateAdContent(campaign.gameTitle),
      durationSec: 5,
    },
  });
}
