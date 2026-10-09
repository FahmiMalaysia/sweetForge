import { NextResponse } from 'next/server';
import { issueChallenge } from '@/lib/server/captcha';

export async function POST() {
  const c = issueChallenge();
  return NextResponse.json(c);
}
