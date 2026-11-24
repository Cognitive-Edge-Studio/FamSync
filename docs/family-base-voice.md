# Family Base voice

Built locally on 24 November 2026; not deployed. ElevenLabs was checked once with a made-up sentence and no family data; Gemini has not been. Adults only, read only, off by default. Replaces the plan in [family-base-voice-plan.md](family-base-voice-plan.md), which proposed a different design.

## What it does

Family Base → **Call**, on web and Android. Speak; it notices when you stop, answers aloud in a warm female voice, and listens again. Interrupt, pause, or end at any time. The words and the records used are shown. It adds one short insight when useful, says it is an AI, changes nothing, and does not act as a companion, counselor, doctor or lawyer.

## How it works

Each turn goes to the FamSync API, which asks ElevenLabs for the words, reads Family Base **as the speaker**, asks Gemini for the answer, and asks ElevenLabs to speak it. Compared with the planned live agent:

- ElevenLabs gets the voice and the spoken answer, not the family's records.
- Both keys stay on the server, and no new Android library is needed.
- Replies take a few seconds, and a person interrupts with a button rather than by talking over it.

Protections: owner switch, separate 18+ notice and consent, 15 minutes a person and 30 a family per day, 5 minutes a call, 30 seconds and 2 MB a turn. Recordings, words and answers are neither stored nor logged by FamSync; usage rows hold who, when, which family and how many seconds, for 30 days. Earlier turns of a call live only on the screen. Records and earlier turns are treated as data, not instructions. Emails, chat, file contents and record IDs are not sent.

## Decide before activating

1. **Under 18.** On 24 November 2026 ElevenLabs' use policy bars apps directed at under-18s without its written approval, and Google's Gemini terms bar clients likely to be used by them (see [family-base-ai.md](family-base-ai.md)). FamSync families include children. The 18+ confirmation limits who talks; it cannot tell a child's voice. Get legal advice, and ElevenLabs' approval if needed.
2. **Retention.** ElevenLabs' zero-retention mode is for enterprise customers only. The notice says providers may keep data.
3. **Voice.** The default is a ready-made ElevenLabs voice. A cloned voice needs its speaker's written consent.

## Activate

Apply `20261207000000_add_family_voice.sql` **before** deploying the API; readiness checks for it. Then the web app and a new Android build. On the API only: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `FAMILY_VOICE_ENABLED=true`, plus `GEMINI_API_KEY` and `FAMILY_AI_ENABLED=true`. Set a monthly spending limit in ElevenLabs and Google. Optional: `ELEVENLABS_LISTEN_MODEL` (`scribe_v3`), `ELEVENLABS_SPEAK_MODEL` (`eleven_flash_v2_5`).

Check the keys first: `node --env-file=.env.voice-test.local scripts/check-voice.mjs`.

## Verified

73 API, 89 mobile and 21 database access tests, type checks, and the Android bundle. Against a local stand-in: signed out, voice off, a member turning it on, no consent, not adult, wrong file, large file and injected turns were refused; time was counted; a follow-up carried the earlier turn. On screen in Expo's web target with a simulated microphone: hands-free turn, spoken answer, automatic listening, Done talking, End call.

## Not verified

A full call with real services, Gemini, cost and delay. (ElevenLabs alone passed `check-voice.mjs`: the voice, speaking, and listening to its own speech.) The website's call window was type-checked, not opened. Nothing ran on a phone: the microphone permission, loudness detection on real hardware, calls, Bluetooth and interruptions are untested.
