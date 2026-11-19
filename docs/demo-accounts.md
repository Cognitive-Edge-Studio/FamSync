# Demo accounts (local only)

Synthetic accounts for demos on the local Docker stack. They do not exist on staging or production.

| Person | Role | Email |
|---|---|---|
| Emily Carter | Family owner (use this for demos) | `emily@demo.famsync.test` |
| Michael Carter | Member | `michael@demo.famsync.test` |
| Jake Carter (10th grade) | Member | `jake@demo.famsync.test` |
| Lily Carter (6th grade) | Member | `lily@demo.famsync.test` |
| Linda Brooks (Grandma) | Member | `linda@demo.famsync.test` |

Password for every demo account: `FamSync-demo-2026!`

## What the seed creates

One family, **The Carter Family** (America/Chicago), with dates relative to the day you run it:

- **Calendar:** weekly soccer practice and piano lessons, Sunday dinner at Grandma's, Thanksgiving, a parent–teacher conference and a cardiology visit shared with selected members, a ski trip, a private monthly book club, two appointments today, a past birthday, and an anniversary dinner only Emily and Michael can see. One practice is cancelled and one lesson moved.
- **Tasks and chores:** 16 tasks across members (event-linked, private, selected-audience, overdue, in progress and completed) and 4 repeating chores.
- **Goals:** a ski-trip checklist with linked tasks, reading, piano and savings progress, a manual goal and a completed goal.
- **Conversations:** Household, Ski trip and a parents-only School run channel, with replies and a mention, plus two direct conversations.
- **Files:** medical records (Emily and Grandma only), school documents, bills (Emily and Michael), and a trip folder inside the Ski trip channel.

Every record is created through the API, so audiences, versions and links follow the normal rules. Signing in as different members shows what each can and cannot see.

## Reseed

With the local Supabase stack and the API running (point `DEMO_API` at the API port):

```bash
DEMO_API=http://127.0.0.1:4016 node --env-file=apps/api/.env.example scripts/seed-demo.mjs
```

Rerunning deletes the previous demo family and accounts and recreates them. Stored file bytes from the old demo stay in local Storage.
