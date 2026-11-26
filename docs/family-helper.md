# Family Helper

An AI member of the family that lives in FamSync. Requested by the client on 26 November 2026 ("Add a Family Helper"). Built on web, API and the Android app (Expo), using the existing Google Gemini setup.

## What it does

- **Add a Family Helper.** Any member names it and picks an emoji (sidebar → Family Helper on web; pinned row at the top of Chats, or More, on Android). One helper per family.
- **Juniper’s mascot.** The default look uses the supplied turquoise-and-cream character: full-body on the welcome screen and a portrait in headers, chat messages, mention suggestions, and navigation. The default Look choice is labelled **Mascot**; other emoji looks remain available. Web and Android bundle optimized transparent WebP images. Regenerate them with `node scripts/prepare-juniper-mascot.mjs`; the supplied original is preserved at `output/mascots/juniper/source.png`. Existing helpers using the original default leaf marker receive the mascot without a database change.
- **In chats.** Add it to any conversation with the helper button in the chat header (web) or chat details (Android). Speak to it with `@Name …` (it appears first in the @ mention list) or `Name, …`. It replies in the thread, shows "Name is typing…" while it works, and mentions the asker so they are alerted.
- **Direct chat** on the helper's page, with tap-to-reply suggestions under its answers.
- **Catch me up.** Summarises the member's unread messages across their conversations, plus upcoming plans from Family Base.
- **Shared shopping list.** One list per family. The helper and members add, tick off and clear items; each item can be "for" a member.
- **Memory.** Short facts ("Jake is allergic to peanuts"), optionally about one member. Visible and deletable on the helper's page. Capped at 200 per family.
- **Tasks.** Creates tasks, with a due date and assignee.
- **Ask everyone.** `@Name ask everyone what they need from the store by 6pm` posts the question and collects plain replies (no mention needed) until the deadline. A banner shows the deadline in the family's time zone. 30 minutes before the deadline (for collections longer than 45 minutes) it names who has not answered. At the deadline, or on "wrap it up", it adds what people asked for to the shopping list under their names and posts a summary. "Never mind" cancels without adding anything. One open collection per conversation; deadlines between 1 minute and 7 days.

## Activate

Apply migrations, in order, before deploying the API:

1. `20261209000000_add_family_helper.sql`
2. `20261210000000_add_helper_collections.sql`
3. `20261211000000_add_helper_collection_reminders.sql`

Then deploy the API, the web app and a new Android build. The helper uses the same API settings as Family Base AI: `GEMINI_API_KEY` (already set on Render), optional `GEMINI_MODEL`, and `FAMILY_AI_ENABLED=false` as a server-wide off switch. Without a key the helper can still be added and the shopping list and memory work; it shows that AI isn't set up.

For local mobile web testing, the API's `WEB_ORIGINS` must include `http://localhost:8081` (now in `apps/api/.env.example`).

## How it works

- **Harness** (`apps/api/src/gemini-agent.ts`): sends the context and a list of tools to Gemini, runs the tools the model asks for, returns their results, and repeats (at most 5 rounds) until the model answers. The model never touches the database; it can only ask for one of the tools in `family-helper.service.ts`.
- **Context** per reply: the family's time zone and today, who asked, the member names, up to 80 remembered facts, and in chats the last 40 messages plus a rolling summary of older ones (refreshed once 80 messages build up past it).
- **Who it acts as.** Every read and write runs as the member who spoke to it, through the same row-level security as the rest of the app. The job worker login never reads family content: for queued work it only claims the job and learns who it belongs to, then the work runs as that member.
- **Reliability.** Chat replies are queued (`helper.reply`) and run straight away in their own lane, so a restart or failure retries them instead of losing them. A retried reply never posts twice (its message id is derived from the question's). Collection deadlines and reminders run from the same job queue (`helper.collection.close`, `helper.collection.remind`).
- **Output** is plain text; any Markdown the model still writes is stripped before it is posted.

## Decide before launch

These were set aside on purpose for the first version (26 November 2026); they are recorded here so they are decided before real families use it.

1. **Privacy.** Unlike Family Base questions, the helper sends chat messages (the conversation it is in, and the asker's unread messages for catch-up) to Google's Gemini service. There is no per-member notice or consent step for the helper.
2. **Children.** See the under-18 note in `family-base-ai.md`; it applies here too, and the helper reads chats children take part in.
3. **Cost and limits.** There is no daily cap yet. Each reply is 1–6 Gemini calls.

## Known limits

- Follow-up replies need the name again (`@Name`); a plain "yes" after the helper's question is not picked up.
- Tap-to-reply suggestions exist only on the helper's own page, not in group chats.
- Queued replies run one at a time in the immediate lane; under load, a family may wait for another family's reply to finish.
- Not yet tested on a physical Android device; tested in the Expo web preview.

## Tests

- `apps/api/test/family-helper.test.mjs`: the harness loop (tool calls, failures, round limit, blocked replies), who the helper answers to, deadline parsing in the family's time zone, and Markdown removal.
- The full flow was exercised locally with real Gemini: catch-up, list, memory, chat replies, ask-everyone with automatic and early close, on web and Android (web preview).
