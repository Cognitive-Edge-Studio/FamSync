import { File, Paths } from 'expo-file-system';
import { discardRecording } from './voice-files';

/** The spoken answer is kept only while it plays. */
export function soundFile(base64: string) {
  const file = new File(Paths.cache, 'famsync-answer.mp3');
  if (file.exists) file.delete();
  file.create();
  file.write(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
  return { uri: file.uri, remove: () => discardRecording(file.uri) };
}
