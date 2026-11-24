# Family Base — Phase 3: questions answered by AI

Implemented locally on 23 November 2026 for Google Gemini. Not deployed, not activated, and never run against the real service.

## Decide before activating

1. **Under-18 use.** Google's Gemini API terms (read 23 November 2026, https://aistudio.google.com/docs/terms) bar using the API in clients "directed towards or is likely to be accessed by" people under 18. FamSync families include children. The 18+ confirmation limits who asks; it does not settle whether the app as a whole qualifies, and records about children are still sent when an adult asks. Get legal advice, written permission, or a provider whose terms fit. Provider code is confined to `gemini-client.ts`.
2. **Paid service only.** On unpaid quota Google may use submitted content to improve its products and people may review it. The notice members accept assumes the paid service. The server cannot detect the tier.

## Activate

Apply migration `20261201000000_add_family_ai.sql`, deploy the API, then the web app. Set on the API server only:

- `GEMINI_API_KEY`: a key from a billed project.
- `FAMILY_AI_ENABLED=true`: your confirmation of both points above. The key alone does nothing.
- `GEMINI_MODEL` (optional): defaults to `gemini-3.8-flash`.

Then each family owner turns questions on in Family Base, and each adult accepts the notice.

## How it works

- One question, one answer; no conversation history. Limits per family-local day: 20 per member, 60 per family.
- The graph is read as the asker, so only records they can see are sent. Account and record ids are replaced with short codes. Emails, chat messages and file contents are not sent; file names and conversation names are. Notes are shortened to 600 characters.
- Questions and answers are neither stored nor logged. Usage rows hold who, when and which family, and are cleared after 30 days on the family's next question.
- A request the service refuses is not counted. Blocked, failed or timed-out requests are.
- The AI has no tools and cannot change anything. Answers render as plain text.
- If the notice text in `family-ask-dialog.tsx` changes, raise `noticeVersion` in `family-ai.service.ts`.

## Cost

Listed price for the default model on 23 November 2026: $0.75 input / $3.75 output per million tokens, doubling on 1 January 2027. The demo family sends about 9,000 characters per question, so roughly half a cent or less, estimated and not measured. Large families cost more.
