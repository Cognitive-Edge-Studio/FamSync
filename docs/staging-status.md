# FamSync staging deployment

Latest verification: 26 November 2026 (Asia/Dhaka).

## Current release

- Website: https://famsync.goppopi.com. The helper, photo avatars, chat stickers, mascot and adoption navigation are published. Seven main pages and 32 referenced assets matched the release files by SHA-256. The signed-in helper screen loaded with Juniper and no browser console errors.
- API commit `4af4a7e4f2c6e796324eb6ad53022200aeab9eb3` is live on Render, deploy `dep-dc43tclbedkc73d3d6j0`. Health/readiness, helper/list/memory, avatar/sticker availability, avatar resolution, website CORS and Android version policy checks passed. Unauthenticated sticker access returned 401.
- Supabase has all 43 migrations. The owner made a backup at `output/backups/staging-before-release-20261126-201128.dump`; restricted API-login checks confirmed the new tables and sticker permission.
- Website archive: `output/famsync-web-staging-20261126-avatars-stickers.zip`. Server rollback copy: `famsync-before-20261126.zip` in the hosting account root, outside `public_html` (150.5 MiB).
- AI and voice are available and enabled on staging; existing settings were preserved. The demo family has no helper yet; members can add one from **Adopt a family member**. No demo conversations were generated during deployment.
- Android version 0.1.0, **build 3**, package `com.goppopi.famsync`, finished in Expo. [Build page](https://expo.dev/accounts/shibly_noman/projects/famsync/builds/b25d06de-d484-41a4-baf4-6c52eb15ce67). Downloaded and archive-verified at `output/distribution/downloads/FamSync-0.1.0-build-3.apk`. Physical-phone acceptance remains pending. iOS is deferred.
- Git metadata: `C:/shibly/FamSync/output/release-source.git`; origin `https://github.com/Cognitive-Edge-Studio/FamSync.git`. Render tracks `main` and auto-deploys code commits. The API runtime stays on `4af4a7e`; documentation follow-ups skip Render.
- Inngest scheduled jobs (including cleanup/reminder timing), Resend/SMTP acceptance and real-device testing remain open. The Android download is available from Expo; no permanent hosted APK distribution page or raised minimum build was configured.

Full release record and rollback details: [26 November release](staging-release-2026-11-26.md). The sections below retain historical deployment observations.

## Previous release: 24 November 2026

- API commit `f50903575863b77bc9831bf6c3f3914f3dc6a314` is live. `/health`, `/api/v1/status`, the Android version endpoint, and authenticated Family Base graph, AI status and voice status checks passed.
- The hosted voice migration and API execution permissions were verified. Android push reports `available: true` after the approved integration settings were deployed. Real-device delivery remains untested.
- Hostinger serves `output/famsync-web-staging-20261124-voice.zip` (296 files, 50,614,434 bytes). Homepage, sign-in, Family Base and `push-worker.js` matched the local release files by SHA-256 after deployment. The owner chose to deploy without a new server-side rollback copy; the earlier website ZIP remains available.
- Gemini and ElevenLabs credentials are installed, but `FAMILY_AI_ENABLED` and `FAMILY_VOICE_ENABLED` remain `false` pending the owner's provider-terms and billing decision. No live generation or full call was performed.
- Standalone Android build submitted to Expo: [build page](https://expo.dev/accounts/shibly_noman/projects/famsync/builds/c07b45d5-644e-47c2-9b0a-f1796173a56d), package `com.goppopi.famsync`, version `0.1.0`, build `1`. Last checked: queued; no APK artifact yet.
- Its Expo signing key was downloaded and verified in the Git-ignored `output/backups/android-signing-com.goppopi.famsync` directory. Keep a separate private copy outside this computer. Signing exports are excluded from both Git and EAS uploads.
- Inngest and Resend setup, Supabase SMTP/redirect/private-Realtime acceptance, AI/voice activation and real-phone acceptance remain outstanding. `ANDROID_UPDATE_URL` is unset until a permanent download page and successful APK can be published.

The notes below describe the earlier 19 November setup and releases.

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

- Latest frontend release: `b27c150`, published 19 November 2026. Includes the updated Today agenda and family progress chart, default-family selection, realistic photos, and the product tour video.
- Latest artifact: `output/famsync-web-staging-20261119-update.zip`, 50,581,580 bytes, 293 entries. Build ID: `9Q-a8saJUdvllxpKqRJlq`.
- Both homepage and Today HTML matched the local production build by SHA-256 after extraction. New photo, video, and caption URLs returned HTTP 200; API readiness and CORS checks passed.
- The owner demo login and populated Today dashboard were verified after publication. Selecting Jake Carter showed his one visible goal at 75% and corresponding task counts; no browser console errors were observed.
- This release changed no API code or migrations and did not reseed the hosted database. Changes to the seed script apply to future seed runs, not existing demo records.

- Website: https://famsync.goppopi.com
- The static Next.js production build exported all 31 routes. The deployment ZIP has 278 entries, includes `.htaccess`, and excludes environment files.
- Build artifact: `output/famsync-web-staging.zip` (generated locally, not committed).
- Hostinger extracted the archive directly into this site's `public_html`. The import wizard reported a recognition warning, but the public homepage, sign-in page, and auth callback route all returned HTTP 200.
- The homepage and sign-in screen were verified in the browser, with no sign-in console errors.
- Render's `WEB_ORIGINS` and `INVITATION_WEB_ORIGIN` are set to the website origin. The readiness endpoint returned the matching `Access-Control-Allow-Origin` header.
- Supabase Auth Site URL is the website origin; its redirect allowlist contains `https://famsync.goppopi.com/auth/callback/**`.

## Demo access

The hosted Carter family demo is seeded with five confirmed fictional accounts, 13 calendar events, 16 tasks, four recurring chores, six goals, three channels, two direct conversations, and six files across four folders. The owner login is `emily@famsync.test`; its updated credentials were verified against Supabase Auth and the family API, preserving the same user ID and seeded family. The populated Today dashboard was also verified in the hosted browser. See `demo-accounts.md` for the other personas. Demo passwords are kept only in the Git-ignored `.env.staging-demo.local` file and handed to the staging owner.

## Remaining integrations

- Sign in to Inngest, configure its event/signing keys in Render, set `INNGEST_SERVE_ORIGIN` to the API origin, and sync `/api/inngest`.
- Sign in to Resend, configure its sending key and sender in Render, and configure Supabase Auth SMTP.
- Finish the private Realtime settings and the hosted acceptance checks in `deployment.md`.

Health checks confirm API/database availability. Invitations, reminders, hosted sign-in, uploads, and live channel updates still need integration checks after these settings are complete.
