import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';

// GET /api/games/[userId]/[gameId]/header?v=<publishedAt>
// Serves the game's cover image so ads can point at a URL instead of carrying
// the image bytes in every ad response. The ?v= value changes on each publish,
// so a cached copy is never stale, and it can be cached for a year.
const ID_RE = /^[a-zA-Z0-9_.:-]{1,120}$/;
const IMAGE_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string; gameId: string }> },
) {
  const { userId, gameId } = await params;
  if (!ID_RE.test(userId) || !ID_RE.test(gameId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const obj = await prisma.object.findUnique({
    where: { userId_key: { userId, key: `games/${gameId}.meta.json` } },
    select: { data: true },
  });
  if (!obj) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  let meta: { headerImage?: unknown };
  try {
    meta = JSON.parse(Buffer.from(obj.data).toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Bad meta' }, { status: 500 });
  }
  const img = typeof meta.headerImage === 'string' ? meta.headerImage : '';

  const m = IMAGE_RE.exec(img);
  if (m) {
    return new NextResponse(new Uint8Array(Buffer.from(m[2], 'base64')), {
      headers: {
        'Content-Type': m[1],
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  if (img.startsWith('https://')) {
    return NextResponse.redirect(img, { status: 302, headers: { 'Cache-Control': 'public, max-age=86400' } });
  }
  return NextResponse.json({ error: 'No cover image' }, { status: 404 });
}
