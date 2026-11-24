import type { VoiceRecorderProps } from './voice-recorder';
import { Sheet } from './form';
import { Text } from './ui';
export function VoiceRecorder({ onClose }: VoiceRecorderProps) {
  return <Sheet title="Voice message" onClose={onClose}><Text>Record voice messages in the Android app. This browser preview supports playback and file attachments.</Text></Sheet>;
}
