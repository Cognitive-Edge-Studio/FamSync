# Android M5: voice and video

Implemented locally on 24 November 2026; not deployed. Scope: M5 in the [Android and chat spec](android-app-spec.md), matching the [W4 media API](chat-w4.md). Physical-phone testing is deferred at the user's request, as for [M4](android-m4.md).

## Action audit

| W4 action | Android |
|---|---|
| Record a voice message | Included: microphone button in an empty chat composer, then Start recording |
| Listen before sending, record again, discard | Included; nothing uploads before Send |
| Recording limit | Same ten-minute limit, with the existing 5 MB file limit |
| Upload progress, cancel and retry | Included; an upload retry retains the file UUID. After upload, the existing message outbox owns sending and retry |
| Voice replies | Included; the pending reply is attached to the voice message |
| Audio play, pause and seek | Included in chat and Files; tap the progress bar or use ±15 seconds. Accessibility actions also seek |
| Choose video | Included from the Android gallery or file picker, with the existing upload validation and progress |
| Video playback | Included on demand, in a player with native controls and fullscreen |
| File access, forwarding and deletion | Uses the existing server rules and W4 voice metadata |
| Record a video with the camera | Outside W4's scope; choose an existing clip instead |

## Behavior

- Native recording uses `expo-audio`: mono AAC in an M4A container, at 32 kbps. It stops at ten minutes or the file limit. Final size and duration are checked before Send. Microphone permission is requested when the person starts recording, with an Android-settings action if denied.
- Backgrounding the app or an interruption stops recording and offers the captured recording for review where it can be recovered. Discarding or leaving the recorder removes the local file. Unsent recordings do not survive closing/restarting the app. FamSync recording-cache files are also removed on sign-out, account change and app startup.
- Recording, audio and video share one media owner. Starting another stops the previous one; a slow authorization response cannot start playback after navigation or sign-out. Playback stops when the app backgrounds or the screen loses focus.
- Audio/video load only after Play. The API issues a short authorized preview link on every new audio play/resume or video opening. Audio preserves its paused position across renewal. A denied or expired request shows a retryable error. Signed links are not saved in the read cache.
- Voice upload and message delivery each keep a stable UUID. Losing an upload response leaves the recording available for retry. Once upload completes, the existing message queue shows sending/failed/retry states, and the local recording can be removed. Cancelling a known completed upload before enqueue archives that uploaded file. A discarded upload whose response was lost may leave an unattached server file, as with other chat uploads.
- `expo-video` supplies the video controls. Background playback, background recording and picture-in-picture are disabled. This release retains the 5 MB limit and adds no server transcoding.
- The Expo web target is a development preview: playback works there, while its recording sheet directs testers to Android. The production web app retains W4's browser recorder.

## Configuration

`expo-audio` and `expo-video` were installed at Expo SDK 58-compatible versions. Their config plugins are in `apps/mobile/app.config.js`. The earlier microphone block was removed, including the image-picker option that otherwise reintroduced it. Generated Android manifest inspection confirmed `RECORD_AUDIO` is allowed, with no background audio service added by these plugins.

**Install a new native build** to receive those permission/plugin changes. An older M4 APK will not gain them through a JavaScript refresh. No Firebase configuration is needed for M5's media features. An application ID and Android build environment are still needed to produce an APK; neither an APK nor an EAS upload was produced here.

No API, database or shared-client change was needed. Existing W4 file formats and access rules remain authoritative. Expo references: [audio](https://docs.expo.dev/versions/latest/sdk/audio/) and [video](https://docs.expo.dev/versions/latest/sdk/video/).

## Basic checks passed

- Mobile TypeScript, all 46 mobile tests, and the Android JavaScript bundle.
- The final TypeScript rerun passed. After memory pressure and a sandboxed Hermes failure, the final Android bundle passed outside the Windows sandbox with `--max-workers 1`; temporary preview processes and the test browser were closed.
- Seven media tests cover size/duration limits, seek bounds, media ownership, stale loads, cancellation and cleanup errors. Existing chat/outbox tests continue to cover retry identifiers and saved outgoing messages.
- The API's existing media validation tests still pass. No database tests were repeated because the schema and API did not change.
- Expo config introspection verified the final Android microphone permission and plugin configuration without generating a native project.
- A browser-preview smoke test against the local API used synthetic audio/video in a private self-only test channel. At 390 × 844, audio played and advanced, paused, sought and resumed with a fresh link. An injected preview denial showed the expected error and recovered on retry. Starting video stopped the audio; video advanced and closed. The attachment menu included videos, and the web recorder fallback opened and closed. The test channel was archived afterward.

Smoke-test scripts and screenshots are under `output/playwright/m5-*`. The browser check exercises the web implementations of the Expo players; it does not establish native recording/playback behavior.

## Deferred device acceptance

- Real microphone permission denial, record/review/re-record/send, ten-minute stop, cache cleanup, back/keyboard behavior and accessibility on a physical Android phone.
- Calls, microphone contention, headphones disconnecting, app background/foreground, and interruption recovery without accidentally continuing to record.
- Real native AAC uploads, cancelled/lost-response uploads and message retries between two accounts; revocation or channel archive during recording/upload.
- Android audio seeking, video formats from real phones, fullscreen, no background playback, expired links and loss of access during playback.
- Staging and beta prerequisites, including M4 push acceptance and the minimum supported app-version check.

M5's local implementation is ready for those later checks. M6 (Family Base) remains the next planned development milestone.
