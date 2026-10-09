import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { signToken, comparePassword } from '@/lib/server/auth';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { email, username, password } = await req.json();
    if (!password || (!email && !username)) {
      return NextResponse.json({ error: 'Provide email or username + password' }, { status: 400 });
    }

    let user;
    if (email) {
      user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    } else {
      user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    }

    if (!user || !comparePassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // Track login event for daily reward (dedup by refId = today's date)
    const today = new Date().toISOString().slice(0, 10);
    const existing = await prisma.progressEvent.count({
      where: { userId: user.id, eventType: 'login', refId: `daily_${today}` },
    });
    if (!existing) {
      await prisma.progressEvent.create({
        data: { userId: user.id, eventType: 'login', refId: `daily_${today}` },
      });
    }

    const token = signToken({ id: user.id, email: user.email, username: user.username });
    return NextResponse.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName },
      token,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
