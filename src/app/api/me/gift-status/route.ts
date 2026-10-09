import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/server/ipUser';
import { getAuthUserId } from '@/lib/server/auth';
import { hasClaimableGifts } from '@/lib/server/progress';

// GET /api/me/gift-status
export async function GET(req: NextRequest) {
  const authUserId = getAuthUserId(req);
  const user = await resolveUser(req, authUserId);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const hasGifts = await hasClaimableGifts(user.id);
  return NextResponse.json({ hasClaimable: hasGifts, timestamp: Date.now() });
}
