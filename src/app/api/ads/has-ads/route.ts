import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// GET /api/ads/has-ads (global)
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  await resolveUser(req, authUserId);

    const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "AdCampaign"
    WHERE status = 'active' AND "clicksServed" < "clicksPurchased"`;
  const count = rows[0]?.n ?? 0;

  return NextResponse.json({ hasAds: count > 0, count });
}
