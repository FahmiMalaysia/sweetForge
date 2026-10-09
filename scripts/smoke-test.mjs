#!/usr/bin/env node
// SweetForge server smoke test — checks the real flow the APK uses:
// health → captcha (PoW) → signup → me → object upload/list/download/delete → games
//
// Usage:
//   node scripts/smoke-test.mjs https://NAMA-PROJECT.vercel.app
//   node scripts/smoke-test.mjs http://localhost:3000        (local dev)

import crypto from "node:crypto";

const BASE = (process.argv[2] || process.env.BASE_URL || "").replace(/\/$/, "");
if (!BASE) {
  console.error("Usage: node scripts/smoke-test.mjs <server-url>");
  process.exit(1);
}

let failed = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) failed++;
  return cond;
}

async function call(method, path, { json, text, token, userId } = {}) {
  const headers = {};
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (text !== undefined) {
    headers["Content-Type"] = "text/plain";
    body = text;
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body });
  } catch (e) {
    return { status: 0, error: String(e), data: null, raw: "" };
  }
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* not JSON */ }
  return { status: res.status, data, raw };
}

// Solve the proof-of-work the server asks for: sha256(challenge + nonce) starts with prefix
function solvePow(challenge, prefix) {
  for (let nonce = 0; ; nonce++) {
    const h = crypto.createHash("sha256").update(challenge + String(nonce)).digest("hex");
    if (h.startsWith(prefix)) return nonce;
  }
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  // 1. Health
  const health = await call("GET", "/api/health");
  if (!check("GET /api/health", health.status === 200 && health.data?.status === "ok",
      `status ${health.status}${health.error ? " " + health.error : ""}`)) {
    console.log("\nServer tak jawab. Semak URL, deploy, dan Root Directory.");
    process.exit(1);
  }

  // 2. Captcha
  const cap = await call("POST", "/api/auth/captcha/challenge");
  check("POST /api/auth/captcha/challenge", cap.status === 200 && !!cap.data?.challenge, `status ${cap.status}`);
  if (!cap.data?.challenge) process.exit(1);
  const nonce = solvePow(cap.data.challenge, cap.data.prefix);

  // 3. Signup (fresh random user each run)
  const tag = crypto.randomBytes(4).toString("hex");
  const username = `smoke_${tag}`;
  const email = `smoke_${tag}@example.com`;
  const password = `smoke-test-${tag}`;
  const su = await call("POST", "/api/auth/signup", {
    json: { email, username, password, challenge: cap.data.challenge, nonce },
  });
  const signedUp = check("POST /api/auth/signup", (su.status === 200 || su.status === 201) && !!su.data?.token,
      `status ${su.status} ${su.data?.error || ""}`);
  if (!signedUp) {
    console.log("\nSignup gagal. Biasanya: DATABASE_URL salah / belum db push / JWT_SECRET tak set.");
    finish();
    return;
  }
  const token = su.data.token;
  const userId = su.data.user.id;

  // 4. Login with the same account
  const li = await call("POST", "/api/auth/login", { json: { username, password } });
  check("POST /api/auth/login", li.status === 200 && !!li.data?.token, `status ${li.status}`);

  // 5. Who am I
  const me = await call("GET", "/api/auth/me", { token });
  check("GET /api/auth/me", me.status === 200, `status ${me.status}`);

  // 6. Object storage (what publish/install uses)
  const key = "smoke/hello.txt";
  const put = await call("PUT", `/api/v1/users/${userId}/objects/${key}`, { text: "hello sweetforge", token });
  check("PUT  /api/v1/users/:id/objects/:key", put.status === 200 || put.status === 201, `status ${put.status} ${put.raw.slice(0, 120)}`);

  const get = await call("GET", `/api/v1/users/${userId}/objects/${key}`, { token });
  check("GET  /api/v1/users/:id/objects/:key", get.status === 200 && get.raw === "hello sweetforge", `status ${get.status}`);

  const list = await call("GET", `/api/v1/users/${userId}/objects?prefix=smoke/`, { token });
  check("GET  /api/v1/users/:id/objects?prefix=", list.status === 200 && (list.data?.items || []).some(i => i.key === key),
      `status ${list.status}`);

  const del = await call("DELETE", `/api/v1/users/${userId}/objects/${key}`, { token });
  check("DELETE /api/v1/users/:id/objects/:key", del.status === 200, `status ${del.status}`);

  // 7. Public + token endpoints used by the APK
  const games = await call("GET", "/api/games");
  check("GET /api/games", games.status === 200 && Array.isArray(games.data?.games), `status ${games.status}`);

  const hasAds = await call("GET", "/api/ads/has-ads");
  check("GET /api/ads/has-ads", hasAds.status === 200, `status ${hasAds.status}`);

  const pend = await call("GET", "/api/ads/pending-tokens", { token });
  check("GET /api/ads/pending-tokens (logged in)", pend.status === 200, `status ${pend.status}`);

  const notif = await call("GET", "/api/me/notifications", { token });
  check("GET /api/me/notifications", notif.status === 200, `status ${notif.status}`);

  finish();
}

function finish() {
  console.log(failed === 0 ? "\nSEMUA PASS — server dan APK boleh connect." : `\n${failed} test FAIL — tengok TUTORIAL.md bahagian Troubleshooting.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
