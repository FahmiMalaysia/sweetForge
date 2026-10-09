import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import crypto from 'crypto';

const MAX_UPLOAD = parseInt(process.env.MAX_UPLOAD_BYTES || '5242880', 10); // 5MB

/**
 * Helper: resolve target user ID.
 * - Logged-in users: must match URL userId (security check)
 * - Anonymous (IP-based) users: ignore URL userId, use their IP-derived ID
 */
async function resolveTargetUser(req: NextRequest, urlUserId: string) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return { user: null, targetUserId: null, error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };

  if (user.isAnonymous) {
    return { user, targetUserId: user.id, error: null };
  }
  if (urlUserId !== user.id) {
    return { user: null, targetUserId: null, error: NextResponse.json({ error: 'Cannot access another user storage' }, { status: 403 }) };
  }
  return { user, targetUserId: user.id, error: null };
}

// GET /api/v1/users/[userId]/objects/[...key] — download object
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; key: string[] }> }
) {
  const { userId, key: keyParts } = await params;
  const { targetUserId, error } = await resolveTargetUser(req, userId);
  if (error) return error;

  const key = keyParts.join('/');
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  const obj = await prisma.object.findUnique({
    where: { userId_key: { userId: targetUserId!, key } },
  });
  if (!obj) return NextResponse.json({ error: 'Object not found' }, { status: 404 });

  return new NextResponse(obj.data, {
    headers: {
      'Content-Type': obj.contentType,
      'Content-Length': String(obj.sizeBytes),
      'Cache-Control': 'public, max-age=300',
    },
  });
}

// PUT /api/v1/users/[userId]/objects/[...key] — upload object
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; key: string[] }> }
) {
  const { userId, key: keyParts } = await params;
  const { user, targetUserId, error } = await resolveTargetUser(req, userId);
  if (error) return error;

  const key = keyParts.join('/');
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.length > MAX_UPLOAD) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  // Quota check
  const existing = await prisma.object.findUnique({
    where: { userId_key: { userId: targetUserId!, key } },
  });
  const allObjects = await prisma.object.aggregate({
    where: { userId: targetUserId! },
    _sum: { sizeBytes: true },
  });
  const currentUsed = allObjects._sum.sizeBytes || 0;
  const existingSize = existing?.sizeBytes || 0;
  const newTotal = currentUsed - existingSize + buffer.length;
  if (newTotal > user!.storageQuota) {
    return NextResponse.json({ error: 'Quota exceeded', quota: user!.storageQuota, used: currentUsed, needed: newTotal }, { status: 413 });
  }

  const contentType = req.headers.get('content-type') || 'application/octet-stream';

  await prisma.object.upsert({
    where: { userId_key: { userId: targetUserId!, key } },
    create: {
      id: crypto.randomUUID(),
      userId: targetUserId!,
      key,
      sizeBytes: buffer.length,
      contentType,
      data: buffer,
    },
    update: {
      sizeBytes: buffer.length,
      contentType,
      data: buffer,
    },
  });

  await prisma.user.update({
    where: { id: targetUserId! },
    data: { storageUsed: newTotal },
  });

  return NextResponse.json({ key, sizeBytes: buffer.length, contentType });
}

// DELETE /api/v1/users/[userId]/objects/[...key]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; key: string[] }> }
) {
  const { userId, key: keyParts } = await params;
  const { targetUserId, error } = await resolveTargetUser(req, userId);
  if (error) return error;

  const key = keyParts.join('/');
  const existing = await prisma.object.findUnique({
    where: { userId_key: { userId: targetUserId!, key } },
  });
  if (!existing) return NextResponse.json({ error: 'Object not found' }, { status: 404 });

  await prisma.object.delete({ where: { id: existing.id } });

  // Recompute user storageUsed
  const agg = await prisma.object.aggregate({
    where: { userId: targetUserId! },
    _sum: { sizeBytes: true },
  });
  await prisma.user.update({
    where: { id: targetUserId! },
    data: { storageUsed: agg._sum.sizeBytes || 0 },
  });

  return NextResponse.json({ deleted: true, key });
}
