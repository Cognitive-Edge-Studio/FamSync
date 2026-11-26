# Staging release: 26 November 2026 (Family Helper)

Prepared, not yet deployed. Adds the Family Helper ("Juniper"): chats, catch-up, shared shopping list, memory, tasks, "ask everyone", the mascot look, and a seed for the demo family. Later work adds personalized profile avatars and six chat stickers, plus the label "Adopt a family member" on web navigation and mobile adoption entry points. iOS is deferred at the owner's request; this release covers web, API and Android. Feature details: [family-helper.md](family-helper.md), [personal-avatars.md](personal-avatars.md), and [avatar-stickers.md](avatar-stickers.md). General setup: [deployment.md](deployment.md).

## Checked locally

- Latest avatar/sticker verification: 90 API and 92 mobile tests, eight sticker checks, and avatar lifecycle/access checks pass; mobile type checking, Android bundle export, and the local website export pass. The earlier website production build passed against the staging API address.
- The whole helper flow ran locally with real Gemini on web and Android (Expo web preview).
- The demo seed ran locally end to end, including its live conversations, and a repeat run added nothing.
- Earlier website file: `output/famsync-web-staging-20261126-helper.zip` (308 files, about 51 MB, forward-slash paths, includes `.htaccess`, no environment files). It predates the avatar/sticker work and sidebar rename: rebuild against staging settings and replace the release archive before deployment. Do not upload `apps/web/out-local`, which points at localhost.
- Current website package: `output/famsync-web-staging-20261126-avatars-stickers.zip` (308 files, 50,791,230 bytes). The staging production build and TypeScript checks passed. The archive includes `.htaccess`, helper/account/channel routes and the mascot; entry paths use forward slashes and no environment files are included. Compiled JavaScript contains the staging API address and no local API address. SHA-256: `7677B54C94FF6D7081241359012DDB109A1C6F517E50139C4D70A8F5AB4DDC27`.
- Mobile adoption labels now match the web wording; mobile TypeScript passed after this copy update. A fresh APK and physical-phone acceptance remain outstanding.
- `scripts/release-staging-db.ps1 -CheckOnly` passed: both saved staging application logins and the local backup container are available. This preflight does not connect to or migrate the hosted database; the release still needs the Supabase admin password entered privately at execution time.
- The API Dockerfile now copies `apps/api/assets` to `/app/assets`, including the required avatar style reference.
- Deployment packaging check passed: the full Linux API image built successfully, and its non-root runtime decoded `/app/assets/avatars/style.webp` with Sharp in a network-disabled container.
- Read-only hosted check on 26 November: staging `/health` returned 200 with `{"status":"ok"}`, while the website `/helper/` returned 404. The new helper screen is not published. No hosted changes were made during this check.

## Decide first

1. **Verify AI on staging.** The helper needs `FAMILY_AI_ENABLED=true` on Render. The last hosted verification on 24 November recorded it as `false`; subsequent Git commit `37933f2` (25 November, already on remote `main`) enabled configured AI and voice defaults. Verify the actual deployed commit and environment instead of treating the older note as current. With AI off, the helper can be added and the shopping list and memory work, but it cannot answer, and the seed skips the demo conversations. Family Base questions and voice also use this setting (their own consent screens still apply).
2. **Reuse the release repository.** Git metadata exists at `C:/shibly/FamSync/output/release-source.git`, with origin `https://github.com/Cognitive-Edge-Studio/FamSync.git`. Read-only remote verification found `main` and `release/2026-11-24-voice-android` at `37933f2ceb5f36a5dea1a2fa8dfe7f1bf62dd53f`. The local `main` reference still points at older `d6d7d8e`; refresh and confirm the intended release/Render branch before preparing a commit. Inspect this workspace using `git --no-optional-locks --git-dir=C:/shibly/FamSync/output/release-source.git --work-tree=C:/shibly/FamSync status --short`. No new repository is needed. The repository is public: check no secrets are included before pushing (as on 24 November).

## Order

1. **Freeze** the code. Other sessions stop editing.
2. **Back up and migrate the database** (prompts for the Supabase database password; the backup lands in `output/backups/`):
   ```powershell
   & 'C:\shibly\FamSync\scripts\release-staging-db.ps1'
   ```
   Expected new migrations: `20261207000000`, `20261208000000` (if not already applied), then `20261209000000_add_family_helper.sql`, `20261210000000_add_helper_collections.sql`, `20261211000000_add_helper_collection_reminders.sql`, `20261212000000_add_personal_avatars.sql`, `20261213000000_queue_avatar_account_cleanup.sql`, and `20261214000000_add_avatar_stickers.sql`.
3. **API:** push the code, then Manual Deploy in Render. If decided, set `FAMILY_AI_ENABLED=true` first. `/health` should return 200.
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
