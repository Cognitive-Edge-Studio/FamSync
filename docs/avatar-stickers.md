# Avatar stickers in chat

In a channel or direct conversation, choose **Avatar stickers** beside the emoji controls. **My avatar → Create my stickers** generates six expressions from the person's saved profile avatar: waving, laughing, love, thumbs up, celebrating and surprised. Select a sticker to send it. Creating a profile avatar first is required; the tray links to Account when one is missing. Web and Android implement the same flow.

Generation is explicit: the tray explains that the saved avatar is sent to Google Gemini. It uses the existing server-only image configuration and `store:false`. No original selfie is needed. One 3×2 sheet produces six separate 256-pixel WebP stickers with real transparency. The image processor removes the flat color key, corrects edge spill, and rejects malformed/empty layouts. This is AI-generated artwork: identity, expression, layout and edge quality can vary; vivid colors close to the background key may need additional quality checks.

The pack is private to its owner under row-level security. Reservations serialize per account and reuse the pack for the current avatar. An account can create packs for two avatars per UTC day. A failed pack has one explicit retry; temporary job failures retry up to three times per request. A persisted sheet is reused after worker interruption, and an advisory lock prevents simultaneous generation of one pack. A crash after provider completion but before sheet storage can still repeat a paid request.

Sending first copies the selected expression into the authorized conversation's existing private file storage, marks it as a sticker, and uses the normal message outbox. New lookups require current conversation participation. Repeated sends reuse an available copy in that conversation, so each send does not consume another file slot. Sent copies have independent lifetimes: profile replacement or reset removes the private pack, while sent stickers remain with the conversation. Forwarding copies the sticker with the same presentation and the destination's permissions. Deleting a message follows the existing shared-file cleanup rules. Links are signed for 60 seconds.

The tray preserves an unfinished text draft and staged attachments when sending a sticker separately. It can send a sticker as a reply. Generation continues when the tray closes; opening it again resumes progress. Requests from a previous avatar cannot be reused for a new pack. Stickers display without photo frames or file-name/download controls, while normal image attachments retain their existing display.

## Release

Apply `20261214000000_add_avatar_stickers.sql` after the two personalized-avatar migrations, then deploy the API and web app and produce a new Android build. No new provider credentials are needed. The existing Jobs database, outbox scheduler, private Storage settings, `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL` are used. `AVATAR_AI_ENABLED=false` or `FAMILY_AI_ENABLED=false` stops new packs; existing ready packs can still be sent. The provider and intended-user considerations in `personal-avatars.md` and `family-base-ai.md` still apply.

Private packs are queued for cleanup when their source avatar expires/resets or their account is deleted. A 24-hour cleanup job removes abandoned/failed packs; selected ready packs remain. Scheduler and storage availability determine cleanup completion. Raw sticker sheets are private and are deleted with their packs. Conversation copies use normal conversation file access and retention.

## Verification

- `npm run test:stickers --workspace @famsync/api`: sheet protocol/processing, private-pack access, duplicate reservations/sends, retries, archive checks, message/history metadata, forwarding, participant revocation, and profile reset using isolated local fixtures and a mock provider.
- `npm test --workspace @famsync/api`: API regression suite.
- `npm test --workspace @famsync/mobile`, `npm run typecheck --workspace @famsync/mobile`, and `npm run bundle:android --workspace @famsync/mobile`.
- `npm run build:preview`: web static export.

A live provider check used the fictional adult avatar created during avatar QA. The complete browser flow also passed with real local Auth, Storage, API jobs and Gemini: create six expressions, view the tray, send a transparent sticker, and reload the conversation. The phone-width page had no horizontal overflow. Its expressions and processed samples are preserved in `output/sticker-qa/`, with browser evidence at `output/playwright/avatar-sticker-*.jpg`. The disposable QA account and storage objects were removed after verification.

Results: 90 API regression tests, 92 mobile tests, and eight sticker provider/integration checks passed. Avatar integration checks also passed alongside the sticker suite. Web static export, Android TypeScript and Android bundle export passed. No physical Android device test or hosted deployment has been performed.
