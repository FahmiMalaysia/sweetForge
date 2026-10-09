import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// GET /api/ads/campaigns
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const campaigns = await prisma.adCampaign.findMany({
    where: { developerId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ campaigns });
}
