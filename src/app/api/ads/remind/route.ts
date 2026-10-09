import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import crypto from 'crypto';

// POST /api/ads/remind  { campaignId, gameTitle }
// Saves a reminder into the player's Inbox. This is NOT a play: nothing is paid.
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId : '';
  const gameTitle = typeof body.gameTitle === 'string' ? body.gameTitle.trim().slice(0, 100) : '';
  if (!campaignId || !gameTitle) {
    return NextResponse.json({ error: 'Missing campaignId or gameTitle' }, { status: 400 });
  }

  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // One reminder per player per campaign.
  const existing = await prisma.notification.findFirst({
    where: { userId: user.id, type: 'ad_remind', refId: campaignId },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ saved: true, duplicate: true });

  await prisma.notification.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      type: 'ad_remind',
      title: 'Reminder saved',
      message: `We will remind you about "${gameTitle}".`,
      refId: campaignId,
    },
  });

  return NextResponse.json({ saved: true, duplicate: false });
}
