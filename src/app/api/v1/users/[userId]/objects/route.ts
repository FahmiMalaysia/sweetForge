import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';

// GET /api/v1/users/[userId]/objects?prefix= — list objects
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  // For logged-in users: verify URL userId matches their own
  // For anonymous (IP-based) users: ignore URL userId, use their IP-derived ID
  const targetUserId = user.isAnonymous ? user.id : userId;
  if (!user.isAnonymous && targetUserId !== user.id) {
    return NextResponse.json({ error: 'Cannot read another user storage' }, { status: 403 });
  }

  const url = new URL(req.url);
  const prefix = url.searchParams.get('prefix') || '';

  const objects = await prisma.object.findMany({
    where: { userId: targetUserId, key: { startsWith: prefix } },
    select: { key: true, sizeBytes: true, updatedAt: true },
    orderBy: { key: 'asc' },
  });

  const items = objects.map(o => ({
    key: o.key,
    size: o.sizeBytes,
    modifiedAt: o.updatedAt.toISOString(),
  }));

  return NextResponse.json({ items, objects: items, count: items.length });
}
