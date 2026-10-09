/**
 * lib/server/captcha.ts — Stateless PoW captcha (JWT-based, no in-memory pool)
 *
 * Old approach: in-memory Map (doesn't work on Vercel serverless — each request
 * may hit a different instance).
 *
 * New approach: server signs a JWT containing the challenge + expiry.
 * Client solves PoW (SHA-256 starts with "0000"), returns challenge + nonce.
 * Server verifies signature + expiry + hash, then validates.
 *
 * Single-use is enforced by tracking used challenges in DB (or accept that
 * replay window = JWT TTL, which is 5 min — acceptable for our use case).
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const DIFFICULTY = 4; // 4 hex zeros = 65536 iterations average
const CHALLENGE_TTL_SEC = 5 * 60; // 5 minutes

export function issueChallenge(): {
  challenge: string;
  expiresIn: number;
  difficulty: number;
  algorithm: string;
  prefix: string;
} {
  const challenge = crypto.randomBytes(16).toString('hex');
  // Sign challenge + expiry as JWT (stateless — works on serverless)
  const token = jwt.sign(
    { challenge, exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC },
    JWT_SECRET
  );
  return {
    challenge: token, // client sends this back as "challenge"
    expiresIn: CHALLENGE_TTL_SEC * 1000,
    difficulty: DIFFICULTY,
    algorithm: 'sha256',
    prefix: '0'.repeat(DIFFICULTY),
  };
}

export function verifyChallenge(signedChallenge: string, nonce: number): boolean {
  if (!signedChallenge || nonce === undefined || nonce === null) return false;

  // Verify JWT signature + expiry
  let payload: { challenge?: string };
  try {
    payload = jwt.verify(signedChallenge, JWT_SECRET) as any;
  } catch {
    return false; // invalid signature or expired
  }
  if (!payload.challenge) return false;

  // Verify PoW: SHA-256(challenge + nonce) starts with "0000"
  const hash = crypto
    .createHash('sha256')
    .update(payload.challenge + String(nonce))
    .digest('hex');
  const prefix = '0'.repeat(DIFFICULTY);
  if (!hash.startsWith(prefix)) return false;

  return true;
}
