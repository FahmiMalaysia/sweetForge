import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import { computeProgress } from '@/lib/server/progress';
import crypto from 'crypto';

const VALID_EVENT_TYPES = new Set(['publish', 'play', 'install', 'comment', 'vote', 'login']);

// POST /api/me/progress/track
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { eventType, refId } = await req.json();
  if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: 'Invalid eventType' }, { status: 400 });
  }

  // Dedup by refId
  if (refId) {
    const existing = await prisma.progressEvent.count({
      where: { userId: user.id, eventType, refId },
    });
    if (existing > 0) {
      const progress = await computeProgress(user.id);
      return NextResponse.json({ tracked: false, reason: 'duplicate', progress });
    }
  }

  await prisma.progressEvent.create({
    data: { id: crypto.randomUUID(), userId: user.id, eventType, refId: refId || null },
  });

  const progress = await computeProgress(user.id);
  return NextResponse.json({ tracked: true, progress });
}
