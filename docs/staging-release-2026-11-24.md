# Staging release: 24 November 2026

Prepared, not deployed. General setup is in [deployment.md](deployment.md).

## Checked

- 68 API, 78 mobile and 20 database access tests pass; the website production build passes.
- No private passwords or connection strings from the local `.env` files appear in files that would be committed. Keys found in `compose.local.yml`, `supabase/docker/prepare-realtime.sh` and `.env.example` are local development keys. Check again before pushing: the repository is public.
- Staging still runs the release of 19 November: push, chat privacy, Family Base graph and the Android version check return 404.

## Website

- File: `output/famsync-web-staging-20261124.zip` (295 files, about 51 MB). It includes `.htaccess` and `push-worker.js`, and contains no local addresses.
- It must go up **after** the database and API, because it calls endpoints staging does not have yet.

## Order

1. **Freeze** the code. Other sessions stop editing.
2. **Back up** the hosted database.
3. **Database:** in Supabase, note the session pooler host, then run the command below. Enter the two application passwords **already in `.env.hosted-db.local`**: the script sets them again, and different ones disconnect the API.
   ```powershell
   & 'C:\shibly\FamSync\scripts\hosted-db-setup.ps1' -ProjectRef 'axzyacocepjelsgqnsky' -PoolerHost '<POOLER-HOST>'
   ```
   Expected from 24 November's files: up to nine new migrations, `20261130000000` to `20261206010000`. Those already applied are skipped.
4. **API:** push the code, then Manual Deploy in Render. Optional keys: `VAPID_*` (browser push), `FCM_*` (Android push), `ANDROID_MINIMUM_BUILD`, `ANDROID_UPDATE_URL`. `/health`, then `/api/v1/mobile/android/version`, should return 200.
5. **Website:** back up `public_html`, upload the zip and extract it over the old files.
6. **Sign-in:** add `famsync://auth/callback**` to Supabase redirect URLs.
7. **Demo data:** see below.
8. **Check** with the demo accounts, then hand over.

**Rollback:** Render's previous deploy and `output/famsync-web-staging-20261119-update.zip`. Migrations are not undone; that needs the backup.

Still open from 19 November: Inngest (scheduled reminders), Resend (invitation and sign-up email) and the private Realtime setting (live chat).

## Demo data

`scripts/seed-demo-extras.mjs` adds to the family already on staging. It deletes nothing, and repeating it does not duplicate items. Running it in a later week adds that week's plans. It sets the demo's own pin, star, reactions and mute again, and re-creates a Family Base entry someone deleted.

```powershell
node --env-file=.env.staging-demo.local scripts/seed-demo-extras.mjs --staging
```

The guest account needs `SUPABASE_STORAGE_KEY`, `JOBS_DATABASE_URL` and `INVITATION_TOKEN_SECRET` from Render's environment as well (pass a second `--env-file`, kept outside the project; `NODE_EXTRA_CA_CERTS` as in [demo-accounts.md](demo-accounts.md)). Without them everything else is added and the guest is skipped. The voice message uses a computer voice; the video is made from the demo photos. The script has run locally, not on staging.

## Client test accounts

Website: https://famsync.goppopi.com/sign-in/. Passwords are in `.env.staging-demo.local`; send them privately. Emily uses `DEMO_OWNER_PASSWORD`, everyone else `DEMO_PASSWORD`.

| Account | Sign in as | What to see |
|---|---|---|
| Emily, owner | `emily@famsync.test` | Everything, family settings, invitations, guests |
| Michael, member and group admin | `michael@staging.demo.famsync.test` | Parents' items, one muted chat |
| Jake and Lily, members | `jake@…`, `lily@staging.demo.famsync.test` | No parents-only chat or medical files |
| Linda, member | `linda@staging.demo.famsync.test` | Medical folder, Sunday dinners |
| Nora, guest only | `nora@staging.demo.famsync.test` | Only the Soccer carpool channel |

| Feature | Try |
|---|---|
| Today, Calendar | Today's dentist visit and movie night; move or cancel one soccer practice |
| Tasks, chores, goals | Complete a task, edit one occurrence, tick a Ski trip goal step |
| Chat | Open two accounts side by side: reply, react, mention, edit, delete, pin, star, forward |
| Voice, video, photos | Household (Grandma's voice message), Ski trip (video and photo) |
| Files | Trip documents; upload one and archive it |
| Family Base | Search "Pine Ridge"; Emily's private memory is hidden from everyone else |
| Privacy | Compare the same screens as Emily and as Jake |
| Guests | Nora's only channel; revoke her as Emily |
| Settings | Read receipts, online status, quiet hours, theme |

Not testable until set up: email to outside addresses, scheduled reminder delivery, browser push, Android push, Google sign-in and AI questions. All testers share one family, so they see each other's changes. Android needs a separate phone build.

## Migration rehearsal

On 24 November 2026 a throwaway local database was built with the 26 migrations before 30 November (27 tables, as staging is documented to have), and filled with older local data: 78 families, 239 messages and 151 files. The nine new migrations then ran as the non-superuser `postgres` role. All succeeded, each in under two seconds, with no messages lost, and all 20 access tests passed afterwards. They drop no table, column or function. The copy was then deleted. This does not prove the hosted project's own permissions; the script stops at the first failure and keeps earlier migrations.

## Shareable Android APK

After steps 3, 4 and 6 (the app stops at its first screen until `/api/v1/mobile/android/version` returns 200), build the self-contained `preview` APK. Its public staging addresses, permanent package ID `com.goppopi.famsync`, and Firebase client-config path are in `apps/mobile/eas.json`. Use the variables and command in [android-phone-build.md](android-phone-build.md) with `--profile preview`. It installs alongside the development APK (`com.famsync.dev`). The matching `google-services.json` is kept out of Git and must be present in the EAS upload. Firebase server credentials have authenticated successfully; real-phone push acceptance remains pending.
