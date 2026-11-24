/** The notice adults accept before talking. Raise noticeVersion in family-voice.service.ts whenever it changes. */
export const voiceNotice = [
  'You will be talking with an AI, not a person. Its voice is made by a computer.',
  'What you say is sent as audio to ElevenLabs, which turns it into words. The spoken answer is made by ElevenLabs too.',
  'Your words and the Family Base records you can see are sent to Google’s Gemini service to write the answer. That includes names, titles, dates, statuses, locations, and notes, including your private ones.',
  'Chat messages, file contents and email addresses are not sent.',
  'FamSync doesn’t store recordings, words or answers. ElevenLabs and Google may keep them for a time under their own rules.',
  'Talk where it’s fine to be overheard, and don’t let anyone under 18 use it.',
  'Answers can be wrong. Check the linked records. It is not medical, legal or emergency help.',
];

export type VoiceStatus = { available: boolean; enabled: boolean; canManage: boolean; consented: boolean; remainingSeconds: number };
/** What the person can do now. The server checks each of these again. */
export const voiceStep = (status: VoiceStatus): 'unavailable' | 'off' | 'consent' | 'used' | 'ready' =>
  !status.available ? 'unavailable' : !status.enabled ? 'off' : !status.consented ? 'consent' : status.remainingSeconds <= 0 ? 'used' : 'ready';

export const voiceLimits = { callSeconds: 300, recordSeconds: 30, waitSeconds: 10, turns: 6 } as const;
export const minutesLeft = (seconds: number) => seconds < 60 ? 'less than a minute left today' : Math.floor(seconds / 60) + (seconds < 120 ? ' minute' : ' minutes') + ' left today';

/** Decides from loudness alone when someone has started and finished speaking. Quiet rooms and noisy ones both work, because it follows the room. */
export function speechGate() {
  let floor = -50, loudSince: number | null = null, started = false, lastLoud = 0, begin: number | null = null;
  return {
    /** `db` is loudness, 0 at most; `at` is milliseconds. */
    hear(db: number, at: number): 'waiting' | 'speaking' | 'done' | 'silent' {
      begin ??= at;
      const level = Number.isFinite(db) ? Math.max(-100, Math.min(0, db)) : -100;
      const loud = level > Math.max(-48, Math.min(-22, floor + 12));
      if (!started) {
        // The room is learned only while nobody is heard, and only slowly upward.
        if (!loud) floor += (level - floor) * (level < floor ? 0.3 : 0.05);
        if (loud) loudSince ??= at; else loudSince = null;
        if (loudSince !== null && at - loudSince >= 180) { started = true; lastLoud = at; return 'speaking'; }
        return at - begin >= voiceLimits.waitSeconds * 1000 ? 'silent' : 'waiting';
      }
      if (loud) lastLoud = at;
      return at - lastLoud >= 1300 || at - begin >= voiceLimits.recordSeconds * 1000 ? 'done' : 'speaking';
    },
    get started() { return started; },
  };
}

export type VoiceTurn = { you: string; reply: string };
/** Only the last few turns go with the next question, and they live only on the screen. */
export const keepTurns = (turns: VoiceTurn[], next: VoiceTurn): VoiceTurn[] => [...turns, { you: next.you.slice(0, 500), reply: next.reply.slice(0, 1200) }].slice(-voiceLimits.turns);
