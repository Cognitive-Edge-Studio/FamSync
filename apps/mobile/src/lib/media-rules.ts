export const maxVoiceSeconds = 600;
export const maxMediaBytes = 5 * 1024 * 1024;
export type VoiceRecording = { id: string; seconds: number; file: { uri: string; name: string; type: string; size: number } };
export const mediaTime = (value: number) => {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
};
export const seekPosition = (value: number, duration: number) => Number.isFinite(value) && Number.isFinite(duration) ? Math.min(Math.max(0, value), Math.max(0, duration)) : 0;
export function recordingProblem(milliseconds: number, bytes: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 500 || !Number.isFinite(bytes) || bytes <= 0) return 'That recording was too short. Please record again.';
  if (milliseconds > (maxVoiceSeconds + 1) * 1000) return 'Voice messages can be up to ten minutes.';
  if (bytes > maxMediaBytes) return 'That recording is larger than 5 MB. Please record a shorter message.';
  return null;
}

export type MediaLease = { current: () => boolean; release: () => void };
/** One recording/player at a time; a slow load never starts after another one took over. */
export function mediaFocus() {
  let generation = 0, active: (() => void | Promise<void>) | undefined;
  return {
    async claim(stop: () => void | Promise<void>): Promise<MediaLease> {
      const previous = active, mine = ++generation;
      active = stop;
      try { await previous?.(); } catch { /* A released native player cannot hold the next one. */ }
      return { current: () => generation === mine, release: () => { if (generation === mine) { generation += 1; active = undefined; } } };
    },
    async stop() {
      generation += 1;
      const previous = active; active = undefined;
      try { await previous?.(); } catch { /* Sign-out and navigation still finish. */ }
    },
  };
}
