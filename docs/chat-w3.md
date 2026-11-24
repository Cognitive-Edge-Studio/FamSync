# Chat W3: live status and alerts

Implemented locally on 23 November 2026; not deployed. Scope: W3 in the [Android and chat spec](android-app-spec.md). Builds on [W1](chat-w1.md) and [W2](chat-w2.md).

## What it does

- **Live delivery:** the API sends chat signals itself right after a change is saved. The job runner remains the fallback, and open screens still check every 15 seconds. Requests no longer wait for the job runner to be contacted.
- **Receipts:** sent, delivered and read ticks, and Message info with who has read or received it. In a channel, a tick advances when everyone who was a member at that time has reached it. Messages sent before this release show no ticks.
- **Delivered** means a person's chat list or conversation fetched the message. It is not inferred from a signal.
- **Typing:** shown for about six seconds unless renewed. Not stored. At most one start signal every two seconds.
- **Online and last seen:** for family members only; guests neither show nor see it. A heartbeat runs each minute while FamSync is visible; 100 seconds without one means offline.
- **Alerts:** ordinary channel messages now alert members who have not muted the channel, keeping one unread alert per person and channel. Mentions stay separate. A mention added by editing is alerted.

## Privacy

Account → Privacy → Chat privacy, on by default, both reciprocal:

- **Read receipts off:** others see delivery only, and you don't see their reads. Reading privately sends authors no signal, and turning receipts on later does not reveal it.
- **Online, last seen and typing off:** nothing is stored, sent or received.

Receipt signals go only to the authors concerned. The database functions apply both people's settings, so the API never receives hidden values.

## Defaults used, awaiting the client

Receipts and presence on with opt-out; alerts for ordinary channel messages on with mute.

## Deployment order

Migration `20261204000000_add_chat_live_status.sql`, then the API, then the web app. `JOBS_DATABASE_URL`, `SUPABASE_REALTIME_URL` and `SUPABASE_REALTIME_KEY` must be set on the API, and Realtime private channels enabled. Inngest is no longer needed for ordinary chat delivery, but still runs retries and all other jobs.

## Verified

All 18 database access-test files, 31 API unit tests, the 3 job tests, and a two-listener Realtime check against the local service without Inngest calling this API: ten messages were signalled in 164–271 ms from the start of the request. Typing arrived in about 170 ms. Also: receipts, private reading, presence, typing privacy and alerts through the API with three accounts; ticks, typing, Message info, online status and the privacy setting in the browser; and delivery by fallback with Realtime stopped.

Those timings are from one computer and are not a prediction for hosted staging.

## Not verified or known limits

- Hosted staging, load with many members, a real phone, a screen reader, and guests in the browser. Guest rules are covered by access tests.
- The chat list does not show typing, and delivery is acknowledged only from chat screens.
- Two devices: closing one may show a person offline until the other's next heartbeat, up to a minute.
- Chat signal order is preserved per server; several API servers would each send their own.
