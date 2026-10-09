# SweetForge Server (API)

Baca **TUTORIAL.md** untuk setup, deploy ke Vercel, dan troubleshooting.

Quick start (local):
```bash
cp .env.example .env   # isi DATABASE_URL & JWT_SECRET
npm install
npx prisma db push
npm run dev
npm run smoke -- http://localhost:3000
```
