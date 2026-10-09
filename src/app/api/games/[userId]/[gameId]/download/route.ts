import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';

// GET /api/games/[userId]/[gameId]/download — download zip
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string; gameId: string }> }
) {
  const { userId, gameId } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^[a-zA-Z0-9_-]+$/.test(gameId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const obj = await prisma.object.findUnique({
    where: { userId_key: { userId, key: `games/${gameId}.aegame.zip` } },
  });
  if (!obj) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  return new NextResponse(obj.data, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${gameId}.aegame.zip"`,
    },
  });
}
