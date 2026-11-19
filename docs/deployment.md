# Staging deployment (free tiers)

| Part | Service | Plan |
|---|---|---|
| Web app (static files) | Hostinger web hosting, on the free assigned address | your existing plan |
| API (NestJS, Docker) | Render web service | Free |
| Database, sign-in, file storage, live updates | Supabase | Free |
| Scheduled jobs | Inngest Cloud | Free (Hobby) |
| Email | Resend | Free |

Values written as `<LIKE-THIS>` come from the step that creates them. Keep every secret in the service's own settings screen, never in the repository or chat.

**Known free-tier limits**
- **Render** puts the API to sleep after about 15 minutes without requests, and the next request takes 30–60 seconds. Inngest calls the API every 5 minutes, which keeps it awake in practice. One service uses about 730 of the 750 free hours a month.
- **Supabase** pauses a free project after 7 days with no activity. Restore it from the dashboard. It isn't suitable for production.
- **Reminders** are polled every 5 minutes (`JOBS_POLL_CRON`), so they can arrive up to 5 minutes late. Set the variable to `* * * * *` on a paid scheduler plan.
- **Resend** sends 100 emails a day. Until you verify a domain, it only delivers to your own Resend account email.

## Before you start

1. Put the project on GitHub. Render deploys from a repository, and this folder isn't one yet.
2. Create accounts: Supabase, Render, Inngest and Resend. Note your Hostinger site address (`https://<SITE>`), for example `https://lightblue-xyz-123456.hostingersite.com`.

## 1. Supabase (database, sign-in, storage, live updates)

1. Create a project named `famsync-staging` and pick the region closest to your users (for example *West US (Oregon)*). Save the database password it shows (`<DB-ADMIN-PASSWORD>`).
2. **Project Settings → API keys:** copy the **publishable** key (`<PUBLISHABLE-KEY>`) and create or copy a **secret** key (`<SECRET-KEY>`). The project URL is `https://<REF>.supabase.co`.
3. **Connect → Session pooler:** copy the host. It looks like `aws-0-<REGION>.pooler.supabase.com`, port `5432`.
4. Apply the schema from your computer, in the repository folder. Choose two new random passwords of at least 24 characters, one for each FamSync login:
   ```bash
   ADMIN_DATABASE_URL="postgresql://postgres.<REF>:<DB-ADMIN-PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres" FAMSYNC_API_PASSWORD="<API-DB-PASSWORD>" FAMSYNC_JOBS_PASSWORD="<JOBS-DB-PASSWORD>" node scripts/hosted-db-setup.mjs
   ```
   On Windows, use the PowerShell launcher instead. It prompts for all three passwords privately, validates the application password lengths, and works from any folder. Replace the path, project reference, and pooler host for your project:
   ```powershell
   & 'C:\shibly\FamSync\scripts\hosted-db-setup.ps1' -ProjectRef '<REF>' -PoolerHost 'aws-0-<REGION>.pooler.supabase.com'
   ```
   Keep the two application passwords in your password manager for the Render settings. The launcher does not save them to disk, and it restores the previous process environment after running.

   You can rerun it safely; migrations that already ran are skipped. If one fails, it stops and names the file. This script has only been rehearsed locally, so this first hosted run is its real test.
5. **Authentication → URL Configuration:** set **Site URL** to `https://<SITE>` and add `https://<SITE>/auth/callback/**` to the redirect URLs.
6. **Authentication → Emails → SMTP settings:** use Resend's SMTP (step 4) so sign-up and recovery emails aren't held to Supabase's small built-in limit.
7. **Realtime → Settings:** turn off public access, so only private channels are allowed.
8. You don't need to create a storage bucket. The API creates the private bucket the first time it starts.

## 2. Render (API)

1. **New → Blueprint**, then pick the repository. Render reads [`render.yaml`](../render.yaml) and creates `famsync-api-staging` with the Docker image from `apps/api/Dockerfile`.
2. Fill in the variables marked *sync: false*:

| Variable | Value |
|---|---|
| `WEB_ORIGINS`, `INVITATION_WEB_ORIGIN` | `https://<SITE>` |
| `INVITATION_FROM` | `FamSync <onboarding@resend.dev>`, or an address on your verified domain |
| `DATABASE_URL` | `postgresql://famsync_api.<REF>:<API-DB-PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require` |
| `JOBS_DATABASE_URL` | the same, with `famsync_jobs.<REF>` and `<JOBS-DB-PASSWORD>` |
| `SUPABASE_AUTH_URL`, `SUPABASE_JWT_ISSUER` | `https://<REF>.supabase.co/auth/v1` |
| `SUPABASE_PUBLISHABLE_KEY` | `<PUBLISHABLE-KEY>` |
| `SUPABASE_STORAGE_URL` | `https://<REF>.supabase.co/storage/v1` |
| `SUPABASE_REALTIME_URL` | `https://<REF>.supabase.co/realtime/v1` |
| `SUPABASE_STORAGE_KEY`, `SUPABASE_REALTIME_KEY` | `<SECRET-KEY>` |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | from step 3 |
| `INNGEST_SERVE_ORIGIN` | the service's own address, for example `https://famsync-api-staging.onrender.com` |
| `RESEND_API_KEY` | from step 4 |

   `INVITATION_TOKEN_SECRET` is generated automatically. Leave `INNGEST_DEV` and `INVITATION_SMTP_PORT` unset on hosted environments.
3. Deploy. Once it's live, `https://<API>/health` should return `{"status":"ok"}`.

## 3. Inngest Cloud (scheduled jobs)

1. Create a production environment for staging and copy its **Event key** and **Signing key** into Render.
2. **Apps → Sync new app:** enter `https://<API>/api/inngest`. Three functions should appear: `dispatch-outbox`, `deliver-reminders` and `plan-reminders`.

## 4. Resend (email)

1. Create an API key with sending access and put it in Render's `RESEND_API_KEY`.
2. Optional, but needed to email anyone other than yourself: **Domains → Add domain**, then add the DNS records it shows in Hostinger's DNS editor. After that, set `INVITATION_FROM` to an address on that domain.
3. For Supabase's sign-in emails, use Resend's SMTP details (`smtp.resend.com`, port 465, username `resend`, password = an API key) in Supabase step 6.

## 5. Hostinger (web app)

1. On your computer, copy [`apps/web/.env.staging.example`](../apps/web/.env.staging.example) to `apps/web/.env.production.local` and fill in `<API>`, `<REF>` and `<PUBLISHABLE-KEY>`. These values are public; they're built into the page files.
2. Build the static site:
   ```bash
   npm run build --workspace @famsync/web
   ```
3. In hPanel, open **File Manager → public_html**. Upload the **contents** of `apps/web/out`, including the hidden `.htaccess` file. Uploading a zip and using **Extract** is the fastest way. Replace the old files on each release.
4. Open `https://<SITE>`. The landing page should load, and so should `https://<SITE>/sign-in/`.

## 6. Check staging

Run these in order. Each one tests a different hosted service.

1. **Sign up and confirm by email:** tests Supabase Auth, SMTP and the redirect URLs.
2. **Create a family:** the browser reaches Render, so CORS and the database logins work.
3. **Invite a second account and accept it:** tests the outbox, Inngest and Resend.
4. **Add an event with a reminder 15 minutes ahead:** it should arrive in the app and by email within about 5 minutes of its time.
5. **Upload a file, then preview and download it:** tests private Storage and the 60-second links.
6. **Post in a channel from two browsers:** the other browser should refresh live through Realtime.

If something fails, check the API logs in Render; each request is logged with its request ID. For email or reminder problems, run this in Supabase's **SQL Editor** to see stuck or failed background jobs:

```sql
select kind, status, count(*) as jobs, max(attempts) as max_attempts from app.outbox group by kind, status order by kind, status;
select id, kind, attempts, request_id, left(last_error, 80) as last_error from app.outbox where status = 'dead' order by finished_at desc limit 20;
```

## Releasing an update

- **API:** push to the default branch and Render redeploys. If the release includes new SQL migrations, run `scripts/hosted-db-setup.mjs` *before* pushing.
- **Web app:** build again and replace the files in `public_html`.
- **Rollback:** use **Rollback** on the previous Render deploy, and re-upload the previous `out` folder. Migrations only add things, so the previous API keeps working with the newer schema.
