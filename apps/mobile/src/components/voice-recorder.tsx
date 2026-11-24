import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type RecordingOptions } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { claimMedia, stopMedia } from '@/lib/media-focus';
import { maxMediaBytes, maxVoiceSeconds, mediaTime, recordingProblem, type MediaLease, type VoiceRecording } from '@/lib/media-rules';
import { discardRecording, recordingSize } from '@/lib/voice-files';
import { ErrorText, Sheet } from './form';
import { AudioPlayer } from './media-player';
import { confirm } from './screen';
import { Button, Text } from './ui';

const options: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY, directory: 'cache', sampleRate: 22050, numberOfChannels: 1, bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac', maxFileSize: maxMediaBytes },
};
type Stage = 'idle' | 'starting' | 'recording' | 'stopping' | 'review' | 'sending' | 'error';
export type VoiceRecorderProps = { onClose: () => void; onSend: (voice: VoiceRecording, signal: AbortSignal, progress: (percent: number) => void) => Promise<void> };

/** A recording remains local until Send. Upload retries retain both the recording and its UUID. */
export function VoiceRecorder({ onClose, onSend }: VoiceRecorderProps) {
  const [stage, setStage] = useState<Stage>('idle'), [error, setError] = useState(''), [note, setNote] = useState(''), [percent, setPercent] = useState(0), [denied, setDenied] = useState(false), [voice, setVoice] = useState<VoiceRecording>();
  const mounted = useRef(true), phase = useRef<Stage>('idle'), generation = useRef(0), recording = useRef<VoiceRecording | null>(null), raw = useRef<string | null>(null), elapsed = useRef(0), id = useRef(''), lease = useRef<MediaLease | null>(null), sending = useRef<AbortController | null>(null);
  const finishRef = useRef<(interrupted?: boolean) => Promise<void>>(async () => {});
  const recorder = useAudioRecorder(options, (event) => { if (event.isFinished || event.hasError) void finishRef.current(event.hasError); });
  const status = useAudioRecorderState(recorder, 250);
  if (phase.current === 'recording' && status.url === raw.current) elapsed.current = Math.max(elapsed.current, status.durationMillis);
  const change = (next: Stage) => { phase.current = next; if (mounted.current) setStage(next); };

  const finish = useCallback(async (interrupted = false) => {
    if (phase.current !== 'recording') return;
    const mine = generation.current;
    const state = recorder.getStatus(); elapsed.current = Math.max(elapsed.current, state.durationMillis);
    change('stopping');
    try {
      if (state.canRecord || state.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, interruptionMode: 'doNotMix' });
      lease.current?.release();
      if (!mounted.current || mine !== generation.current) return;
      const uri = raw.current ?? recorder.uri;
      if (!uri) throw new Error('No recording');
      const bytes = await recordingSize(uri), problem = recordingProblem(elapsed.current, bytes);
      if (!mounted.current || mine !== generation.current) return;
      if (problem) { discardRecording(uri); raw.current = null; setError(problem); change('error'); return; }
      const value: VoiceRecording = { id: id.current, seconds: Math.max(1, Math.min(maxVoiceSeconds, Math.round(elapsed.current / 1000))), file: { uri, name: 'Voice message.m4a', type: 'audio/mp4', size: bytes } };
      recording.current = value; setVoice(value); change('review');
      if (interrupted) setNote('Recording stopped. Listen before sending, or record again.');
    } catch {
      lease.current?.release();
      if (mounted.current && mine === generation.current) { setError('The recording stopped unexpectedly. Please record again.'); change('error'); }
    }
  }, [recorder]);
  finishRef.current = finish;

  async function start() {
    if (['starting', 'recording', 'stopping', 'sending'].includes(phase.current)) return;
    const mine = ++generation.current;
    change('starting'); setError(''); setNote(''); setDenied(false);
    try {
      await stopMedia();
      if (!mounted.current || mine !== generation.current) return;
      discardRecording(raw.current); raw.current = null; recording.current = null; setVoice(undefined);
      let permission = await AudioModule.getRecordingPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!mounted.current || mine !== generation.current) return;
      if (!permission.granted) { setDenied(true); setError('Allow FamSync to use the microphone in Android settings, then try again.'); change('error'); return; }
      lease.current = await claimMedia(() => finishRef.current(true));
      if (!lease.current.current() || !mounted.current || mine !== generation.current || AppState.currentState === 'background') { change('idle'); return; }
      await setAudioModeAsync({ allowsRecording: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix', playsInSilentMode: true });
      id.current = randomUUID(); elapsed.current = 0;
      await recorder.prepareToRecordAsync({ ...options, fileName: 'famsync-voice-' + id.current });
      raw.current = recorder.uri;
      if (!mounted.current || mine !== generation.current || !lease.current.current()) { await recorder.stop(); discardRecording(raw.current); return; }
      recorder.record({ forDuration: maxVoiceSeconds }); change('recording');
    } catch {
      await recorder.stop().catch(() => {});
      discardRecording(raw.current); raw.current = null;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      lease.current?.release();
      if (mounted.current && mine === generation.current) { setError('We couldn’t start the microphone. It may be in use by another app. Try again.'); change('error'); }
    }
  }

  useEffect(() => {
    if (stage !== 'recording') return;
    const current = recorder.getStatus();
    if (current.durationMillis >= maxVoiceSeconds * 1000 || (!current.isRecording && elapsed.current > 0) || current.fileSize >= maxMediaBytes) void finish(!current.isRecording);
  }, [stage, status.isRecording, status.durationMillis, status.fileSize, finish]);
  useFocusEffect(useCallback(() => () => { void finishRef.current(true); }, []));
  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener('change', (next) => { if (next === 'background') void finishRef.current(true); });
    return () => {
      mounted.current = false; generation.current += 1; sending.current?.abort(); lease.current?.release(); app.remove();
      const uri = raw.current;
      void recorder.stop().catch(() => {}).finally(() => { discardRecording(uri); void setAudioModeAsync({ allowsRecording: false }).catch(() => {}); });
    };
  }, [recorder]);

  function close() {
    const leave = () => { generation.current += 1; sending.current?.abort(); onClose(); };
    if (stage === 'idle' || stage === 'error' && !recording.current) return leave();
    confirm('Discard this recording?', stage === 'sending' ? 'The upload will be cancelled and the recording removed from this phone.' : 'This voice message has not been sent. It will be removed from this phone.', 'Discard', leave);
  }
  async function send() {
    const value = recording.current;
    if (!value || phase.current !== 'review') return;
    const mine = generation.current;
    change('sending'); setError(''); setPercent(0);
    await stopMedia();
    if (!mounted.current || mine !== generation.current) return;
    const controller = new AbortController(); sending.current = controller;
    try { await onSend(value, controller.signal, (progress) => { if (mounted.current) setPercent(progress); }); }
    catch (problem) { if (mounted.current && !controller.signal.aborted) { setError(problem instanceof Error ? problem.message : 'We couldn’t upload the recording. Try again.'); change('review'); } }
  }
  return <Sheet title="Voice message" onClose={close}>
    <View style={{ gap: 12 }}>
      <Text muted>Up to ten minutes and 5 MB. Nothing uploads until you press Send.</Text>
      {stage === 'recording' && <><Text accessibilityLiveRegion="polite">{'Recording · ' + mediaTime(status.durationMillis / 1000)}</Text><Button title="Stop recording" onPress={() => void finish()} /></>}
      {(stage === 'starting' || stage === 'stopping') && <Text accessibilityLiveRegion="polite">{stage === 'starting' ? 'Starting the microphone…' : 'Finishing the recording…'}</Text>}
      {stage === 'review' && voice && <><AudioPlayer label="Listen to your recording" uri={voice.file.uri} seconds={voice.seconds} /><Button title="Send voice message" onPress={() => void send()} /></>}
      {stage === 'sending' && <Text accessibilityLiveRegion="polite">{'Uploading voice message · ' + percent + '%'}</Text>}
      {(stage === 'idle' || stage === 'error' || stage === 'review') && <Button variant="outline" title={stage === 'idle' ? 'Start recording' : 'Record again'} onPress={() => void start()} />}
      {denied && <Button variant="outline" title="Open Android settings" onPress={() => void Linking.openSettings()} />}
      <ErrorText>{error}</ErrorText>{note ? <Text muted accessibilityLiveRegion="polite">{note}</Text> : null}
      <Button variant="outline" title="Discard and close" onPress={close} />
    </View>
  </Sheet>;
}
