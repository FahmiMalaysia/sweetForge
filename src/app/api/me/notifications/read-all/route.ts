import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// POST /api/me/notifications/read-all
export async function POST(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({ readAll: true });
}
