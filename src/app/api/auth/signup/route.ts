import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { signToken, hashPassword } from '@/lib/server/auth';
import { verifyChallenge } from '@/lib/server/captcha';
import crypto from 'crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const PASSWORD_MIN = 8;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, username, password, displayName, challenge, nonce } = body;

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    if (!USERNAME_RE.test(username)) return NextResponse.json({ error: 'Username must be 3-30 chars, alphanumeric + underscore' }, { status: 400 });
    if (password.length < PASSWORD_MIN) return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN} chars` }, { status: 400 });

    // Verify captcha
    if (!challenge || nonce === undefined || nonce === null) {
      return NextResponse.json({ error: 'Captcha required' }, { status: 400 });
    }
    if (!verifyChallenge(challenge, nonce)) {
      return NextResponse.json({ error: 'Captcha verification failed' }, { status: 403 });
    }

    // Check duplicates
    const existingEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingEmail) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    const existingUser = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (existingUser) return NextResponse.json({ error: 'Username already taken' }, { status: 409 });

    const id = `u_${crypto.randomBytes(12).toString('hex')}`;
    const quota = parseInt(process.env.USER_QUOTA_BYTES || '10485760', 10);

    const user = await prisma.user.create({
      data: {
        id,
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        passwordHash: hashPassword(password),
        displayName: displayName || username,
        storageQuota: quota,
        isAnonymous: false,
      },
    });

    // Track login event for daily reward
    await prisma.progressEvent.create({
      data: { userId: id, eventType: 'login', refId: `signup_${id}` },
    });

    const token = signToken({ id, email: user.email, username: user.username });
    return NextResponse.json({
      message: 'Account created',
      user: { id, email: user.email, username: user.username, displayName: user.displayName },
      token,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
