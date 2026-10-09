# Tutorial — Run SweetForge Server (API)

Folder ni ialah **server sahaja**. Ia yang login, publish, install, token dan iklan untuk APK.
Ia dijalankan di **Vercel** dan data disimpan di **Neon (Postgres)**.

```
Ini server (folder ni)  ──►  Vercel (API)  ──►  Neon (database)
                                  ▲
                                  │  alamat URL
APK (folder sweetforge-apk)  ─────┘
```

> Server ni TIDAK ada website. Bila buka URL Vercel di `/`, kau dapat JSON info sahaja. Itu normal.

---

## 0. Yang kau perlukan

| Perkara | Kenapa |
|---|---|
| Akaun **Neon** (neon.tech) | Database Postgres percuma |
| Akaun **GitHub** | Tempat simpan kod (untuk Vercel) |
| Akaun **Vercel** (vercel.com, login guna GitHub) | Hosting server |
| **Node.js 20.9+** di PC (opsyen, kalau nak run lokal) | Test di komputer dulu |

---

## 1. Dapatkan database (Neon)

1. Pergi **neon.tech** → sign up.
2. **Create Project** → nama `sweetforge` → region **Singapore** (atau terdekat).
3. Dalam dashboard, klik **Connection string** dan copy. Format:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Simpan dalam fail nota. **Jangan share.**

---

## 2. Test dekat komputer dulu (cara paling senang untuk faham)

```bash
cd sweetforge-server

cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` → connection string Neon tadi
- `JWT_SECRET` → jana random:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

Kemudian:

```bash
npm install
npx prisma db push        # cipta semua table dalam Neon (buat sekali, atau bila schema tukar)
npm run dev               # server jalan di http://localhost:3000
```

Biarkan terminal tu terbuka. Buka **terminal baru**:

```bash
npm run smoke -- http://localhost:3000
```

Kalau nampak **SEMUA PASS**, server kau dah sihat.

> Nota: `npx prisma db push` **tak** dijalankan oleh Vercel. Kau mesti run sekali dari komputer, guna `DATABASE_URL` Neon yang sama. Kalau tak, login/signup akan error "table does not exist".

---

## 3. Deploy ke Vercel

### Cara A — GitHub (disyorkan)

1. Di GitHub, buat repo baru, contoh `sweetforge-server` (boleh private).
2. Upload **isi** folder `sweetforge-server` ke repo tu.
   - Pastikan `.env` **TIDAK** ikut. Ia dalam `.gitignore`, jadi selamat.
   - `node_modules` juga jangan upload.
3. Di Vercel: **Add New → Project** → pilih repo `sweetforge-server` → **Import**.
4. Settings yang kena betul:

   | Setting | Nilai |
   |---|---|
   | Framework Preset | **Next.js** (auto) |
   | Root Directory | `./` |
   | Build Command | `npm run build` (default pun boleh) |

5. Sebelum klik Deploy, buka **Environment Variables** dan tambah:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | connection string Neon |
   | `JWT_SECRET` | random 48-byte hex (sama macam tadi, atau baru) |
   | `JWT_EXPIRES_IN` | `7d` |
   | `CORS_ORIGIN` | `*` |
   | `USER_QUOTA_BYTES` | `10485760` |
   | `MAX_UPLOAD_BYTES` | `4000000` |
   | `DISABLE_ANONYMOUS` | `false` |

6. Klik **Deploy**. Tunggu 2–3 minit.
7. Dapat URL macam `https://sweetforge-server-xxxx.vercel.app`. Simpan URL ni.

### Cara B — terus dari komputer (tanpa GitHub)

```bash
cd sweetforge-server
npm i -g vercel
vercel login
vercel                     # ikut prompt, pilih projek baru
```

Lepas tu set env vars:
```bash
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
vercel env add CORS_ORIGIN production
# ...ulang untuk key lain dalam jadual atas
vercel --prod
```

### Lepas deploy — pastikan database ada

Vercel tak buat table. Dari komputer, dalam folder `sweetforge-server`, guna `DATABASE_URL` Neon yang sama (dalam `.env`):
```bash
npx prisma db push
```

---

## 4. Test server yang dah deploy

```bash
npm run smoke -- https://sweetforge-server-xxxx.vercel.app
```

Atau manual dengan curl:
```bash
BASE=https://sweetforge-server-xxxx.vercel.app
curl $BASE/api/health
curl -X POST $BASE/api/auth/captcha/challenge
curl $BASE/api/games
```

Output yang betul:
- `/api/health` → `{"status":"ok","service":"sweetforge-server",...}`
- `/api/games` → `{"games":[],"count":0}` (kosong pun OK, belum ada game)

---

## 5. Sambung APK ke server

Ada dua cara. Pilih satu (atau dua-dua):

**Cara 1 — set dalam kod APK (disyorkan, auto-connect)**

Dalam folder `sweetforge-apk`, isi `.env`:
```
NEXT_PUBLIC_SERVER_URL=https://sweetforge-server-xxxx.vercel.app
```
Lepas tu build APK seperti biasa. Tiada setting manual untuk user.

**Cara 2 — manual dalam APK (tanpa build semula)**

Dalam APK → **Settings → Server URL** → paste URL → **Save URL** → restart APK.

---

## 6. Update server bila ada perubahan

- **Cara GitHub:** push commit baru ke repo. Vercel auto-deploy.
- **Cara CLI:** `vercel --prod` dari folder ni.

Kalau tukar `prisma/schema.prisma`, jangan lupa `npx prisma db push` sekali lagi (guna `DATABASE_URL` Neon).

---

## 7. Endpoint penting (untuk rujukan)

| Endpoint | Method | Guna untuk |
|---|---|---|
| `/api/health` | GET | Semak server hidup |
| `/api/auth/captcha/challenge` | POST | Dapat soalan captcha (PoW) |
| `/api/auth/signup` | POST | Daftar akaun |
| `/api/auth/login` | POST | Login |
| `/api/auth/me` | GET | Maklumat akaun semasa |
| `/api/v1/users/:id/objects/:key` | GET/PUT/DELETE | Simpan/baca fail (publish/install) |
| `/api/v1/users/:id/objects?prefix=` | GET | Senarai fail |
| `/api/games` | GET | Senarai game public |
| `/api/games/:userId/:gameId/download` | GET | Download game |
| `/api/me` | GET | State user (quota, token) |
| `/api/me/notifications` | GET | Inbox |
| `/api/me/notifications/:id` | DELETE | Padam notification |
| `/api/me/notifications/:id/read` | POST | Tanda sudah baca |
| `/api/ads/*` | GET/POST | Iklan & token |

---

## 8. Troubleshooting

| Gejala | Punca biasa | Cara betulkan |
|---|---|---|
| Buka URL Vercel nampak JSON, bukan game engine | Ini memang betul — folder ni server sahaja | Tak perlu buat apa |
| Semua `/api/...` jawab **404** | Deploy salah folder (projek penuh, bukan `sweetforge-server`) | Deploy semula dari folder `sweetforge-server` |
| Signup/login **500** atau "does not exist" | `db push` belum dijalankan | `npx prisma db push` dengan `DATABASE_URL` Neon |
| Error "Environment variable not found: DATABASE_URL" | Env var tak set di Vercel | Set kat Vercel → Settings → Environment Variables → Redeploy |
| Signup: "Captcha verification failed" | `JWT_SECRET` ditukar antara challenge & signup, atau jam PC salah | Pastikan `JWT_SECRET` tetap; cuba semula |
| APK: "Failed to fetch" / CORS error | URL server dalam APK salah, atau `CORS_ORIGIN` pelik | Semak URL (https, tiada `/` di hujung), `CORS_ORIGIN=*` |
| Upload game gagal ("File too large" / 413) | Vercel hadkan request ~4.5MB | Kecilkan game atau kita bincang cara lain |
| Request pertama lambat (5–10 saat) | Neon sleep & cold start | Normal untuk free tier. Request seterusnya laju |
| "Storage quota exceeded" | Quota user penuh | Naikkan `USER_QUOTA_BYTES` di Vercel, redeploy |
| `smoke` FAIL di `GET /api/games` | Table belum ada / DB sambungan salah | Semak `DATABASE_URL`, jalankan `db push` |

Kalau masih tak jadi: hantar output `npm run smoke -- <URL>` dan log dari Vercel (Deployments → View Function Logs).

---

## Yang TIDAK termasuk

- **C++ cloud storage** (`cloud/game-hub-server/`) tidak ada dalam folder ni. Enjin tak perlukannya untuk APK. Dia belum ada auth dan key belum di-sanitize, jadi jangan deploy public dulu.
