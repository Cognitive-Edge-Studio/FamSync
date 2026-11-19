# FamSync

FamSync is a responsive family workspace. The web app builds to static files, and the NestJS API runs as its own service.

**Family Base** is available at `/family-base/` from the Family navigation group. Its browser-only 3D demo shows a fictional universe with orbit/zoom, node selection, search, constellation filters and a browsable node list. It uses local demo data; real-data relationships and AI behavior are reserved for a later product discussion. See the [3D demo slice](docs/family-base-demo-graph.md) and [user flow, Today analytics and Kanban execution plan](docs/ux-dashboard-kanban-family-base-plan.md).

Implementation is complete locally through S16. Channels and one-to-one Messages support saved history, replies, reactions, unread state, scoped message search, per-account mute, and explicit participant mentions. DM/mention alerts use the in-app inbox; reading the conversation acknowledges its alerts. Both DM participants must remain current family members.

Messages can create tasks after an audience preview, or reference existing events. Linked task audiences stay within the conversation until the creator unlinks the source. Work and source previews check their own access independently. The static `/messages/`, `/direct/`, and `/message/` routes call NestJS; Next.js contains no application server implementation. See [execution results and the next slice](docs/implementation-plan.md). Hosted verification remains pending.

Channel guest access defaults off. A family owner enables it in family settings; channel managers invite guests from **Manage channel guests**. Invitations expire after seven days and require the receiving account's verified email. Resend invalidates the earlier link. The `/join-channel/` screen preserves the invitation through sign-in, and `/guests/` lists only granted guest channels. Guests can converse, search, react, mute, and mention participants, without family directory, work, DM, or management access. Owners can audit and revoke grants without gaining private channel history. Disabling the guest policy revokes all grants and pending invitations; re-enabling requires new invitations. Guest mail uses the existing transactional provider and outbox retry configuration.

Folders hold family files and conversation files. A family folder is Only me, selected members, or the whole family, and its files inherit that audience. Conversation folders follow current channel or DM participation, so guests can upload into them but cannot create or manage folders. Files are PDF, JPEG, PNG, WebP, TXT or CSV up to 5 MB; images and text preview in the app, and every download or preview gets a fresh link that expires within 60 seconds. Messages can attach files from the same conversation's folders, and channel managers can set a channel image (JPEG, PNG or WebP up to 2 MB).

## Run locally

Use Node.js 24 and npm. From the repository root, install the locked dependencies.

```sh
npm ci
```

Start Docker Desktop and create the local FamSync stack. Compose runs Supabase PostgreSQL, Auth, Storage, Realtime, Inngest, and a Mailpit inbox. Startup configures the private local Realtime tenant, applies pending files in `supabase/migrations/`, and loads the synthetic data in `supabase/seed.sql`.

```sh
npm run db:start
```

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`. The examples connect to the local Docker database and API. For a custom local runtime password, set `FAMSYNC_LOCAL_DB_PASSWORD` before creating the database and update `DATABASE_URL` to match.

Run the two apps in separate terminals.

| App | Command | Local address |
|---|---|---|
| Next.js | `npm run dev:web` | `http://localhost:3000` |
| NestJS | `npm run dev:api` | `http://127.0.0.1:4000/health` |

Create an account from `http://localhost:3000/sign-up/`. Open the local inbox at `http://127.0.0.1:55434` and follow the confirmation link in the same browser that requested it. Password recovery and email-change messages also arrive in that inbox. Use the same web origin throughout an email flow so Supabase can recover the PKCE verifier.

Open **Families** to create a workspace, then invite someone by email from the family page. The local NestJS API sends invitation emails to Mailpit over loopback SMTP on port `55435`. Use a second browser profile to open the invitation and sign in or confirm an account with the invited address. Set `INVITATION_WEB_ORIGIN` to the exact web origin you use in the browser. Links expire after seven days. Resending creates a fresh link and invalidates the previous one.

Use the family page to see members and refresh the directory after an invitation is accepted. The owner can edit the family name and time zone, remove a member, or transfer ownership. **Account → Privacy preferences** stores default audiences for Calendar, Tasks, and Goals.

Open the family’s **Calendar** to create a timed or all-day event with a note, location, and one optional attachment up to 5 MB. The family time zone controls the Calendar and Today date boundaries. Local Storage listens on `127.0.0.1:55436`. Add `SUPABASE_STORAGE_URL` and `SUPABASE_STORAGE_KEY` from the API example if your local `apps/api/.env` predates Calendar.

Choose **Repeat** on the event form for daily, weekly, or monthly events. The preview shows up to eight occurrences through the selected end date. Open an occurrence from Calendar or Today to see its details. The event creator can move or cancel that occurrence from its detail page.

Open **Tasks** to create a task with an optional due date and time, an assignee, and an audience. The board and list share status filters and counts with the task section on **Today**. The task creator edits details. The creator or the assignee can start, complete, reopen, or undo a status change. A date-only task becomes overdue after its due day ends in the family time zone.

Choose **Repeat** on the task form to create a daily, weekly, or monthly chore with an optional end date. Each due date becomes its own task when someone opens Tasks, Today, Profile activity, or a goal's task picker, so completing one occurrence leaves the others unchanged. Missed occurrences stay overdue. The creator can edit one occurrence or the whole series, and can archive or restore a task or a series from its detail page. The **Archived** filter on Tasks lists archived items.

A one-time task or a single chore occurrence can link to an event or one occurrence of a repeating event. Use **Add task** on the event page, or the **Linked event** field on the task form. When the event creator moves an occurrence, the dialog can also move the due dates of linked tasks they created by the same number of days, after showing the old and new dates. People who cannot see the event see the task without the link.

The API defaults to port `4000` and host `127.0.0.1`. The `WEB_ORIGINS` list contains the exact origins allowed to call the API from a browser. `GET /health` checks the API process. `GET /api/v1/status` returns HTTP 200 when the restricted database role can connect to the migrated schema, or HTTP 503 when it cannot.

Use `npm run db:apply` to apply pending app migrations to the running local stack. Use `npm run db:stop` to keep the local database, test accounts, and files for another session. `npm run db:reset` discards the FamSync Compose database and attachment volumes and recreates the stack. The SQL files also follow the Supabase CLI project layout for environments that run the full local stack. Compose and the CLI configuration share local service ports, so use one at a time.

## Goals

Open **Goals** to create a Family or Individual goal with manual, checklist, or numeric progress. Individual goals need an assignee who can see the goal. The creator manages details and archive/restore. Visible members can update Family goals, and the creator or assignee can update Individual goals. **Today → Goal progress** shows active goals and summary counts for My items or Whole family.

Manual goals and empty checklists have no percentage. A nonempty checklist completes when every included step is checked. Numeric goals complete at their target, and reducing the current value or raising the target can reopen them. Average progress includes checklists with included steps and numeric goals.

The goal creator can **Link an existing task** from the same family with the same audience. Linked steps follow the task's title and status and open its detail page. Complete or reopen them from Tasks or Today. Archiving the task excludes its step from progress until restore; a checklist with only archived sources stays active without a percentage. **Unlink** removes the step. Audience edits must preserve matching recipients while a link exists.

**Account → Your activity** shows active and completed tasks and goals across your current families. Tasks include ones assigned to you or created by you while unassigned. Goals include ones you created or are assigned. Counts exclude archives and records you cannot see. Use **Refresh activity** to fetch the current counts.

## Channels

Open **Channels** to create a conversation and select its current family members. The creator manages its name, emoji icon, topic, description, participants, and archive/restore. Only participants can open the channel, read history, post, reply, or react. Family ownership does not bypass channel membership. If the channel manager leaves the family, its oldest remaining participant takes over; a channel without participants is archived.

Messages are saved as plain text, with one-level replies and five reversible reactions. **Load earlier messages** opens older history. Failed sends retain the draft for retry. The list shows unread messages from other participants. Opening the latest messages advances your read position; reactions do not add unread messages. Archived channels keep readable history and stop new posts and reactions.

Supabase Realtime listens locally on port `55437`. Copy the Realtime values from both environment examples if your local files predate Channels. `NEXT_PUBLIC_SUPABASE_REALTIME_URL` and `NEXT_PUBLIC_SUPABASE_REALTIME_KEY` configure the browser; keeping the latter separate avoids changing the direct local Auth service's CORS behavior. The outbox worker uses `SUPABASE_REALTIME_URL`, `SUPABASE_REALTIME_KEY`, and the local-only `SUPABASE_REALTIME_HOST`. It sends empty refresh signals to private topics for current participants. NestJS supplies all message content and enforces current access on every request. Reconnect, browser focus, and a periodic check recover missed changes; **Refresh conversation** is available manually.

The local preview verified in ChatGPT's browser is available at `http://127.0.0.1:3013/channels/` while `node output/playwright/start-s13-preview.mjs` is running. That verification build points to the separate API on `4013`. Normal local development uses the ports in the environment examples.

## Reminders and notifications

Tasks, chores, and events have a **Reminder** setting. Timed tasks default to an hour before, and date-only tasks to 08:00 on the due day. A task reminds its assignee, or its creator when unassigned. An event reminds its creator, or everyone who can see it.

Reminders appear under the bell in the header. They are also emailed unless the person turns that off under **Account → Notifications**. Email waits until quiet hours end (21:00–07:00 by default, in the family's time zone) and is skipped when more than two hours late. Each reminder is rechecked when it is due, so moved, completed, cancelled, or no-longer-visible items send nothing. Locally, reminder emails arrive in Mailpit.

The same inbox shows changes that affect you. These include being assigned a task or chore, or no longer being assigned one. They also include a practice or other event occurrence moving or being cancelled when you have a reminder for it or a linked task assigned to you. You are never notified about your own changes. These updates are emailed only if you turn on **Email updates** in your notification settings.

## Background jobs

`npm run db:start` also starts a local Inngest dev server in Docker, with its dashboard at `http://127.0.0.1:8288`. It calls the API's `/api/inngest` endpoint on the host and runs the outbox dispatcher after each change and once a minute. Invitation emails are sent this way and retried after failures.

The API example environment includes the jobs settings:

- `JOBS_DATABASE_URL` uses the separate `famsync_jobs` login, which can manage queued work but cannot read family items.
- `INVITATION_TOKEN_SECRET` signs invitation links.
- `INNGEST_DEV`, `INNGEST_BASE_URL`, and `INNGEST_SERVE_ORIGIN` connect the API to the local scheduler.

When the API runs on a port other than 4000, set `INNGEST_SERVE_ORIGIN` to match and start the scheduler with `FAMSYNC_INNGEST_APP_URL=http://host.docker.internal:<port>/api/inngest`. Run `npm run jobs:status` to see queue counts and failed jobs. Each API response includes an `X-Request-Id` header, which also appears in job logs and queued work.

Hosted environments use Inngest Cloud. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` on NestJS, leave `INNGEST_DEV` unset, and use a different random `INVITATION_TOKEN_SECRET` for each environment.

## Regenerate the API client

```sh
npm run api:generate
```

The command writes the OpenAPI document to `packages/api-client/openapi.json` and updates the browser client's generated schema types. Run it after changing a public NestJS endpoint.

Run the API unit checks for recurrence and task rules with `npm test --workspace @famsync/api`. With the local stack running, `npm run db:test` checks task, chore, event link, job, goal, linked-task, and channel access rules against the restricted database roles and rolls back its fixtures. `npm run test:jobs --workspace @famsync/api` checks that concurrent dispatchers share queued work safely.

## Enable Google sign-in

Create a Web application OAuth client in Google Cloud and configure its consent screen. For the local Compose stack, add `http://127.0.0.1:55431/callback` to its authorized redirect URIs. Set the following in the repository root's ignored `.env` file or in your shell, then run `docker compose -p famsync-local -f compose.local.yml up -d --no-deps auth`.

```dotenv
FAMSYNC_GOOGLE_OAUTH_ENABLED=true
FAMSYNC_GOOGLE_CLIENT_ID=your-google-web-client-id
FAMSYNC_GOOGLE_CLIENT_SECRET=your-google-web-client-secret
```

For hosted environments, register the callback URI shown in the Supabase Google provider settings with Google Cloud. Enable Google in that Supabase project and enter the client ID and secret there. Add the FamSync web origin's `/auth/callback/` route to the Supabase redirect allowlist. Keep client secrets in Supabase Auth's configuration. [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)

The sign-in and sign-up pages show the Google button when Supabase Auth reports that the provider is enabled. To check the setup, sign in with an allowed Google test account and confirm you land on your FamSync account. Also test starting from a pending family invitation to confirm you return to the join screen.

## Build

```sh
npm run build
```

Serve `apps/web/out` from any static file host. For a local preview, run `npx --yes serve apps/web/out` with the dev web app stopped. Start the compiled NestJS service separately with `npm run start:api`. Its health response is `{"status":"ok"}`.

The Next.js scripts use Webpack because Turbopack's CSS worker failed on the Windows setup used to verify this slice.

## Staging configuration

The root `vercel.json` publishes `apps/web/out` as static assets. Set `NEXT_PUBLIC_API_BASE_URL` to the NestJS staging origin before the web build. The static build embeds that public value.

For channel updates, set the browser's `NEXT_PUBLIC_SUPABASE_REALTIME_URL` to the project's WebSocket Realtime endpoint and use a public key in `NEXT_PUBLIC_SUPABASE_REALTIME_KEY` (or the existing publishable-key setting). NestJS uses the HTTPS Realtime endpoint in `SUPABASE_REALTIME_URL` and a server-only key in `SUPABASE_REALTIME_KEY`. Leave `SUPABASE_REALTIME_HOST` unset on hosted deployments; it is a local tenant-routing override. Apply the channel and Realtime-policy migrations and disable public channels in the hosted project's Realtime settings. Verify private joins, revocation, and reconnect in staging before release. [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)

For hosted Supabase Auth, set `NEXT_PUBLIC_SUPABASE_AUTH_URL` to the project Auth URL ending in `/auth/v1` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its public key before building. Set `SUPABASE_AUTH_URL`, `SUPABASE_JWT_ISSUER`, and `SUPABASE_PUBLISHABLE_KEY` on NestJS. Add the staging web callback route to the hosted project's redirect allowlist, enable email confirmation and secure email change, and configure transactional email. The local Compose settings are for loopback development.

For family invitations, set `INVITATION_WEB_ORIGIN` to the staging HTTPS origin. Set `INVITATION_FROM` to a sender on the verified Resend domain and configure `RESEND_API_KEY` on NestJS. Supabase Auth mail uses its own configuration. The family page shows delivery failures and lets an owner resend.

For attachments, set `SUPABASE_STORAGE_URL` to the hosted project’s Storage URL ending in `/storage/v1`, and set `SUPABASE_STORAGE_KEY` to the server-side Supabase secret key on NestJS. Use a private `famsync-attachments` bucket. The API can initialize it on the first upload. NestJS verifies event visibility for each new download URL. An issued URL remains usable for up to 60 seconds. [Storage access](https://supabase.com/docs/guides/storage/serving/downloads) · [API keys](https://supabase.com/docs/guides/api/api-keys)

Build the standalone API image from the repository root.

```sh
docker build -f apps/api/Dockerfile -t famsync-api .
```

Set the managed API service's `DATABASE_URL` to the restricted `famsync_api` login for the staging database. Apply the schema migration with the database owner and provision the runtime login separately. Set `WEB_ORIGINS` to the staging web origin. Point service health monitoring at `/health` and readiness monitoring at `/api/v1/status`.

## Project docs

- [Implementation plan](docs/implementation-plan.md)
- [Product discovery](docs/discovery/README.md)
