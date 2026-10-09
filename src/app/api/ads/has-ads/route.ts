import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// GET /api/ads/has-ads (global)
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  await resolveUser(req, authUserId);

  const count = await prisma.adCampaign.count({
    where: { status: 'active', clicksServed: { lt: prisma.adCampaign.fields.clicksPurchased } },
  });

  return NextResponse.json({ hasAds: count > 0, count });
}
