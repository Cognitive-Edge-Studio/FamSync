import { Directory, File, Paths } from 'expo-file-system';

export const recordingSize = async (uri: string) => new File(uri).size;
export function discardRecording(uri: string | null | undefined) {
  if (!uri) return;
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* Cache may have already been cleared. */ }
}
/** Only FamSync's recordings are removed, including leftovers from an interrupted app run. */
export function clearVoiceFiles() {
  try {
    const directory = new Directory(Paths.cache, 'Audio');
    if (!directory.exists) return;
    for (const file of directory.list()) if (file instanceof File && /^famsync-voice-[a-f0-9-]+\.m4a$/i.test(file.name)) file.delete();
  } catch { /* A missing cache cannot be opened by the app. */ }
}
