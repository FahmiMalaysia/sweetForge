import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';

// GET /api/games — list semua published games (metadata only, scan semua users)
export async function GET() {
  try {
    // Find all *.meta.json objects across all users
    const metaObjects = await prisma.object.findMany({
      where: { key: { endsWith: '.meta.json' } },
      select: { userId: true, key: true, data: true },
    });

    const games: any[] = [];
    for (const obj of metaObjects) {
      try {
        // Prisma Bytes field can be Buffer, Uint8Array, or number[] depending on runtime
        let dataStr: string;
        if (Buffer.isBuffer(obj.data)) {
          dataStr = obj.data.toString('utf8');
        } else if (obj.data instanceof Uint8Array) {
          dataStr = new TextDecoder().decode(obj.data);
        } else if (Array.isArray(obj.data)) {
          dataStr = Buffer.from(obj.data).toString('utf8');
        } else if (typeof obj.data === 'string') {
          dataStr = obj.data;
        } else {
          dataStr = String(obj.data);
        }
        const meta = JSON.parse(dataStr);
        meta.ownerUserId = obj.userId;
        games.push(meta);
      } catch (e) {
        console.error('[/api/games] Failed to parse meta for', obj.key, e);
      }
    }

    games.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    return NextResponse.json({ games, count: games.length });
  } catch (e: any) {
    console.error('[/api/games] Error:', e);
    return NextResponse.json({ error: e.message, games: [], count: 0 }, { status: 500 });
  }
}
