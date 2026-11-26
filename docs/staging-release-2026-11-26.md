# Staging release: 26 November 2026 (Family Helper)

Database, API and website are released to staging; Android build 3 is finished. Scheduled jobs integration and physical-phone acceptance remain pending. Adds the Family Helper ("Juniper"): chats, catch-up, shared shopping list, memory, tasks, "ask everyone", the mascot look, and a seed for the demo family. Later work adds personalized profile avatars and six chat stickers, plus the label "Adopt a family member" on web navigation and mobile adoption entry points. iOS is deferred at the owner's request; this release covers web, API and Android. Feature details: [family-helper.md](family-helper.md), [personal-avatars.md](personal-avatars.md), and [avatar-stickers.md](avatar-stickers.md). General setup: [deployment.md](deployment.md).

## Deployment progress

- The owner ran the staging database release script successfully: backup `output/backups/staging-before-release-20261126-201128.dump` (555,930 bytes), zero pending migrations and 43 present. Restricted-login checks confirmed helper, avatar and sticker tables plus the API's sticker-column permission.
- Release commit `4af4a7e4f2c6e796324eb6ad53022200aeab9eb3` was pushed to `release/2026-11-26-helper-avatars` and fast-forwarded onto GitHub `main`. Source checks found no private hosted credentials in the release; the existing local Docker example credentials were verified separately.
- Render workspace `My Workspace` (`tea-dbvd1rt6e07s73bfhj0g`) was explicitly confirmed by the owner. Service `srv-dbve0r95efls73di7mp0` tracks `main` and automatically deployed the commit. Deploy `dep-dc43tclbedkc73d3d6j0` became **live at 20:16 on 26 November (Asia/Dhaka)**. Previous deploy for rollback: `dep-dc350419n9bc73crfmo0`, commit `37933f2`.
- Hosted checks passed: health/readiness, helper status/list/memory, avatar and sticker availability, avatar resolution, website CORS, and Android version policy. Unauthenticated sticker access returned 401. No new runtime error logs were found in the initial check. Evidence: `output/staging-after-api-release.json`.
- AI and voice were already available on staging; their settings were preserved. The hosted demo family has no helper yet; no demo conversation posts were generated during this release.
- Website published and verified at approximately 22:16 on 26 November (Asia/Dhaka). Before publication, a 150.5 MiB rollback archive, `famsync-before-20261126.zip`, was created in the hosting account root, outside `public_html`. The current release ZIP was uploaded and extracted directly into `public_html` with overwrite enabled. Seven public pages and 32 referenced JavaScript/style/mascot assets matched the local release bytes by SHA-256. The signed-in live helper screen showed Juniper and the adoption navigation label, with no browser console errors. Evidence: `output/hostinger-release-verified.json`.
- Android **build 3**, package `com.goppopi.famsync`, was submitted to the existing Expo project with the existing signing key. Build ID `b25d06de-d484-41a4-baf4-6c52eb15ce67`; [build page](https://expo.dev/accounts/shibly_noman/projects/famsync/builds/b25d06de-d484-41a4-baf4-6c52eb15ce67). Finished at 20:34 on 26 November (Asia/Dhaka). APK downloaded to `output/distribution/downloads/FamSync-0.1.0-build-3.apk` (115,802,921 bytes; SHA-256 `4fada3f8c1a34a90048c446a366afac9374809ca1b6ba80166fb509b91574129`). Its ZIP directory, Android manifest and application bytecode were verified. [Expo APK download](https://expo.dev/artifacts/eas/2XGHVRxPPhsZESxLJFH7fMI23yolf0EEqmnAfk9dw5M.apk), expires 10 December. Build 2 already existed, so versionCode was incremented to 3 for this release. The upload archive excludes server source, private environment files and signing backups.
- Inngest scheduling and real-phone acceptance remain open; they are not implied by the successful API deployment.

## Checked locally

- Latest avatar/sticker verification: 90 API and 92 mobile tests, eight sticker checks, and avatar lifecycle/access checks pass; mobile type checking, Android bundle export, and the local website export pass. The earlier website production build passed against the staging API address.
- The whole helper flow ran locally with real Gemini on web and Android (Expo web preview).
- The demo seed ran locally end to end, including its live conversations, and a repeat run added nothing.
- Earlier website file: `output/famsync-web-staging-20261126-helper.zip` (308 files, about 51 MB, forward-slash paths, includes `.htaccess`, no environment files). It predates the avatar/sticker work and sidebar rename and is superseded by the current package below. Do not upload `apps/web/out-local`, which points at localhost.
- Current website package: `output/famsync-web-staging-20261126-avatars-stickers.zip` (308 files, 50,791,230 bytes). The staging production build and TypeScript checks passed. The archive includes `.htaccess`, helper/account/channel routes and the mascot; entry paths use forward slashes and no environment files are included. Compiled JavaScript contains the staging API address and no local API address. SHA-256: `7677B54C94FF6D7081241359012DDB109A1C6F517E50139C4D70A8F5AB4DDC27`.
- Mobile adoption labels now match the web wording; mobile TypeScript passed after this copy update. Build 3 is complete; physical-phone acceptance remains outstanding.
- `scripts/release-staging-db.ps1 -CheckOnly` passed: both saved staging application logins and the local backup container are available. The owner subsequently ran the full backup/migration script successfully, as recorded above.
- The API Dockerfile now copies `apps/api/assets` to `/app/assets`, including the required avatar style reference.
- Deployment packaging check passed: the full Linux API image built successfully, and its non-root runtime decoded `/app/assets/avatars/style.webp` with Sharp in a network-disabled container.
- Before publication, the hosted helper page returned 404. After publication it returned 200 and matched the current export; API health and readiness also returned 200.

## Verified settings and release source

1. **AI on staging.** Authenticated checks confirmed AI and voice available and enabled. Existing provider settings were preserved; the helper, avatar and sticker status endpoints report available.
2. **Release source.** Reuse `C:/shibly/FamSync/output/release-source.git`, origin `https://github.com/Cognitive-Edge-Studio/FamSync.git`. Render tracks remote `main` and automatically deployed release commit `4af4a7e`. Documentation-only follow-up commits use `[skip render]` so they do not trigger another API rollout.

## Order

1. **Freeze** the code. Other sessions stop editing.
2. **Back up and migrate the database** (prompts for the Supabase database password; the backup lands in `output/backups/`):
   ```powershell
   & 'C:\shibly\FamSync\scripts\release-staging-db.ps1'
   ```
   Expected new migrations: `20261207000000`, `20261208000000` (if not already applied), then `20261209000000_add_family_helper.sql`, `20261210000000_add_helper_collections.sql`, `20261211000000_add_helper_collection_reminders.sql`, `20261212000000_add_personal_avatars.sql`, `20261213000000_queue_avatar_account_cleanup.sql`, and `20261214000000_add_avatar_stickers.sql`.
3. **API:** push the release to the verified `main` branch. Render currently deploys commits automatically; avoid a second manual trigger after pushing. Wait for the deploy to become live and verify health and authenticated feature endpoints.
4. **Website:** back up `public_html`, then upload `output/famsync-web-staging-20261126-avatars-stickers.zip` and extract it over the old files. If web source changes after this package, rebuild and repackage first. Only after steps 2 and 3: the site calls endpoints the old API lacks.
5. **Demo data:** see below.
6. **Android:** a new build is needed for the helper screens (`eas build`, as on 24 November).
7. **Check** as Emily and one other demo person, then hand over.

**Rollback:** Render's previous deploy and `output/famsync-web-staging-20261124-voice.zip`. Migrations only add tables and columns, so the previous API keeps working; undoing them needs the backup.

## Demo data

`scripts/seed-helper-demo.mjs` adds the helper to the existing Carter demo family. It only adds; repeating it adds nothing.

```powershell
node --env-file=.env.staging-demo.local scripts/seed-helper-demo.mjs --staging
```

It creates Juniper with the mascot look (unless the family already has a helper), adds it to Household and Holiday plans, fills the shopping list with items from each person (one already bought), and saves five facts (for example "Jake is allergic to peanuts"). With AI on, it also runs two real conversations in Household once: a catch-up, and an "ask everyone" with replies from Michael, Jake and Lily and a summary. With AI off it says so; run it again after switching AI on to add them.

## Known staging gaps

- **No scheduler (Inngest) yet.** Helper replies and "wrap it up" run straight away without it. A collection's own deadline and its 30-minute reminder run on the next activity in the API after they fall due (any chat message), not exactly on time, until Inngest is set up. Event reminders are still not delivered, as before.
- **Free Render plan** sleeps after about 15 minutes; the first message to Juniper after that waits up to a minute for the API to wake.
- **Avatars and stickers** need the existing Gemini key to have image-model access, AI generation enabled, and scheduled outbox cleanup configured. Validate generation, save/reset, sticker sending, and cleanup on staging before client acceptance. Physical Android acceptance is still pending.

## Try it (as Emily)

| Where | Try |
|---|---|
| Sidebar, Adopt a family member | Ask "Catch me up"; tap a suggestion; check the shopping list and memory |
| Household | Type `@j` and pick Juniper; ask what's on the shopping list |
| Household | `@Juniper ask everyone what they want for pizza, answers in 10 minutes`, reply as Jake, then `@Juniper wrap it up` |
| Android, Chats | Juniper pinned at the top |
