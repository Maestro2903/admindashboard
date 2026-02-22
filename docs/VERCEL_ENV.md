# Vercel environment variables

The app runs on Vercel and uses env vars from the Vercel project (production and preview).

## Option 1: Push from .env.local (recommended)

1. **Link the project** (once):
   ```bash
   npx vercel link
   ```
   Choose your scope and project (e.g. `tk26admin`).

2. **Set all variables in `.env.local`** (Firebase, Upstash, APP_URL, etc.).  
   For production, set:
   ```bash
   APP_URL=https://tk26admin.vercel.app
   ```

3. **Push env to Vercel**:
   ```bash
   npm run vercel:env-push
   ```
   This reads `.env.local` and runs `vercel env add KEY production --force` and `vercel env add KEY preview --force` for each variable. It skips `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID`.

4. **Redeploy** if the project was already deployed (env changes apply to new deployments).

## Option 2: Set in Vercel Dashboard

In [Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables**, add each variable for **Production** and **Preview** (and **Development** if you use `vercel dev`).

Use the same names and values as in `.env.example`:

- Firebase (client): `NEXT_PUBLIC_FIREBASE_*`
- Firebase Admin: `FIREBASE_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` (or `FIREBASE_SERVICE_ACCOUNT_KEY`)
- `APP_URL` = `https://tk26admin.vercel.app` (no trailing slash)
- Upstash: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Optional: `QR_SECRET_KEY`, `RESEND_API_KEY`, Cashfree, `NEXT_PUBLIC_MAIN_SITE_URL`, etc.

## APP_URL

The app uses `APP_URL` when set (e.g. for callbacks or redirects). On Vercel you can set:

- **Production / Preview:** `APP_URL=https://tk26admin.vercel.app`

Vercel also sets `VERCEL_URL` automatically; the code prefers `APP_URL` so you can use a custom domain or a fixed URL.
