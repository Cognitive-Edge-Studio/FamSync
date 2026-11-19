# FamSync staging deployment

Verified on 19 November 2026 (Asia/Dhaka).

## API and database

- API: https://famsync-api-staging.onrender.com
- Render service: `famsync-api-staging`, Docker, Free, Singapore.
- Render dashboard: https://dashboard.render.com/web/srv-dbve0r95efls73di7mp0
- Deployed commit: `15c18bd89e9d7a08b0b9831c348ded93b9834fb1`.
- `/health` and `/api/v1/status` both returned HTTP 200 with `{"status":"ok"}`.
- Supabase project reference: `axzyacocepjelsgqnsky`, Seoul.
- The hosted database contains 27 FamSync tables. Both restricted application logins were verified.
- Full database TLS certificate and hostname verification passed using Supabase's public root certificate, bundled in the API image.
- Database URLs and Supabase API keys are configured in Render. Local database URLs are in the Git-ignored `.env.hosted-db.local`; keep this file private.
- The service was created from the public Git repository through Render's Web Service form. Use Manual Deploy for subsequent releases until a GitHub integration or Blueprint enables automatic deploys.

## Frontend

- Website: https://famsync.goppopi.com
- The static Next.js production build exported all 31 routes. The deployment ZIP has 278 entries, includes `.htaccess`, and excludes environment files.
- Build artifact: `output/famsync-web-staging.zip` (generated locally, not committed).
- Hostinger extracted the archive directly into this site's `public_html`. The import wizard reported a recognition warning, but the public homepage, sign-in page, and auth callback route all returned HTTP 200.
- The homepage and sign-in screen were verified in the browser, with no sign-in console errors.
- Render's `WEB_ORIGINS` and `INVITATION_WEB_ORIGIN` are set to the website origin. The readiness endpoint returned the matching `Access-Control-Allow-Origin` header.
- Supabase Auth Site URL is the website origin; its redirect allowlist contains `https://famsync.goppopi.com/auth/callback/**`.

## Still required for the complete staging application

- Sign in to Inngest, configure its event/signing keys in Render, set `INNGEST_SERVE_ORIGIN` to the API origin, and sync `/api/inngest`.
- Sign in to Resend, configure its sending key and sender in Render, and configure Supabase Auth SMTP.
- Finish the private Realtime settings and the hosted acceptance checks in `deployment.md`.

Health checks confirm API/database availability. Invitations, reminders, hosted sign-in, uploads, and live channel updates still need integration checks after these settings are complete.
