# Family Base voice agent: plan

Proposed on 24 November 2026. **Not built.** The client asked for a call button in Family Base: a warm female voice that answers from the person's own data, guides them and gives insights. An ElevenLabs API key is available.

## What people get

- **Call** in Family Base, on web and Android: speak, hear an answer, interrupt, hang up. Captions on screen, and mute.
- Questions such as "What's due this week?", "Who is driving on Thursday?", "Which goal needs attention?"
- Insights: busy days, overdue work, goals falling behind. Offered once, kindly, not as blame.
- Opens a record on screen when it mentions one.
- **First version reads only.** Later it may draft a task or event, always shown and confirmed by a tap.
- A warm, friendly voice and manner. It says it is an AI, and is not a companion, counselor or medical or legal advisor.

## How it would work

1. The phone asks the FamSync API to start a call. The API checks membership, consent, owner switch and limits, then asks ElevenLabs for a short-lived call token. **The ElevenLabs key stays on the server.**
2. The phone talks to the ElevenLabs agent directly.
3. When the agent needs data it calls FamSync tools (week, tasks, goals, events, people, search). Each runs on the API as the caller, with the existing access rules, and returns only short records. No chat messages, file contents or email addresses.
4. Nothing is stored by FamSync except who called, when and for how long.

This reuses the existing question feature's access-checked context, codes instead of IDs, notice, 18+ consent, owner switch and limits. Voice needs its own notice, because audio leaves the phone.

## Decisions needed first

| Decision | Why | Suggested |
|---|---|---|
| Who may call | Family apps have children in them. Voice and AI providers restrict use by minors, and a child's voice is sensitive data. Read ElevenLabs' current terms and get legal advice | 18+ only, owner must turn it on, off by default |
| Recording | ElevenLabs can keep audio and transcripts | Retention off or shortest possible; say so in the notice |
| Voice | A stock voice avoids consent problems; a cloned voice needs the speaker's written consent | Stock voice, chosen by the client |
| Budget | Calls are charged by the minute, plus the language model | 5 minutes a call, 15 minutes a person a day, and a monthly cap for all families |
| Language model | Family data goes to it too | The client's choice in ElevenLabs, named in the notice |
| What it may change | A wrong change made by voice is easy to miss | Read only first |

## Work

| Step | Size |
|---|---|
| API: start-call endpoint, tools, limits, consent, migration, access tests | Large |
| Web call screen | Medium |
| Android call screen (native audio, interruptions, Bluetooth), needs a new APK | Large |
| Testing with real accounts, guests refused, lost access during a call, cost limits | Medium |

On Render it would need `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`, server only. Never put the key in the app, the website or GitHub.
