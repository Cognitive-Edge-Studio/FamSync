import type { components } from '@famsync/api-client';
import { keepTurns, minutesLeft, speechGate, voiceLimits, voiceNotice, voiceStep, type VoiceTurn } from '@famsync/core/voice';
import { AudioModule, createAudioPlayer, RecordingPresets, setAudioModeAsync, useAudioRecorder, type AudioPlayer, type RecordingOptions } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { openBaseNode } from '@/components/family-base';
import { ErrorText, Row } from '@/components/form';
import { Mascot } from '@/components/mascot';
import { confirm, LinkRow, Page, queryState, WithFamily } from '@/components/screen';
import { Button, Card, Text } from '@/components/ui';
import { getApi, required } from '@/lib/api';
import { uploadFile } from '@/lib/attachments';
import { useBaseQuery } from '@/lib/base-query';
import type { Family } from '@/lib/family';
import { singularLabels, type BaseGraph } from '@/lib/family-base';
import { claimMedia } from '@/lib/media-focus';
import { mediaTime, type MediaLease } from '@/lib/media-rules';
import { useMediaScope } from '@/lib/media-scope';
import { useSave } from '@/lib/save';
import { useSignedIn } from '@/lib/session';
import { discardRecording } from '@/lib/voice-files';
import { soundFile } from '@/lib/voice-sound';

type Reply = components['schemas']['FamilyVoiceReplyDto'];
type Stage = 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'paused';
const options: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, directory: 'cache', isMeteringEnabled: true, sampleRate: 22050, numberOfChannels: 1, bitRate: 32000, android: { outputFormat: 'mpeg4', audioEncoder: 'aac' } };
const stageText: Record<Stage, string> = { idle: '', starting: 'Connecting…', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', paused: 'Paused' };

export default function CallScreen() { return <><Stack.Screen options={{ title: 'Talk to Family Base' }} /><WithFamily>{(family) => <Call key={family.id} family={family} />}</WithFamily></>; }

const Notice = () => <View style={{ gap: 6 }}>{voiceNotice.map((line) => <Text key={line}>{'• ' + line}</Text>)}</View>;

function Call({ family }: { family: Family }) {
  const { access_token } = useSignedIn(), { busy, error, save } = useSave(), path = { familyId: family.id }, [adult, setAdult] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), params = { path: { familyId: family.id } };
    const [status, graph] = await Promise.all([api.GET('/api/v1/families/{familyId}/base/voice', { params, signal }).then(required), api.GET('/api/v1/families/{familyId}/base/graph', { params, signal }).then(required)]);
    return { status, graph };
  }, [access_token, family.id]);
  const query = useBaseQuery(family.id, 'base-voice', load);
  const state = queryState(query, { loading: 'Checking…', failed: 'Voice couldn’t open', lost: 'Family Base unavailable' });
  if (state || !query.data) return state;
  const { status, graph } = query.data, step = voiceStep(status);
  const setEnabled = async (enabled: boolean) => { const result = await save(() => getApi(access_token).PUT('/api/v1/families/{familyId}/base/voice/settings', { params: { path }, body: { enabled } }), 'We couldn’t save this. Try again.'); if (result.ok) query.replace((old) => ({ ...old, status: result.data })); };
  const setConsent = async (accepted: boolean) => { const result = await save(() => getApi(access_token).PUT('/api/v1/families/{familyId}/base/voice/consent', { params: { path }, body: { accepted, adult } }), 'We couldn’t save this. Try again.'); if (result.ok) { setAdult(false); query.replace((old) => ({ ...old, status: result.data })); } };
  return (
    <Page query={query}>
      {step === 'unavailable' && <Card><Text>Voice isn’t set up on this server yet.</Text></Card>}
      {step === 'off' && <Card>{status.canManage ? <><Text>Voice is off for this family. As the owner, you can turn it on. Each adult then decides for themselves before their first call.</Text><Notice /><Button title="Turn on for this family" busy={busy} onPress={() => void setEnabled(true)} /></> : <Text>Voice is off. Your family owner can turn it on here.</Text>}</Card>}
      {step === 'consent' && <Card><Text weight="600" accessibilityRole="header">Before your first call</Text><Notice /><Row multiple title="I am 18 or older and agree to this." selected={adult} onPress={() => setAdult(!adult)} /><Button title="Agree and continue" busy={busy} disabled={!adult} onPress={() => void setConsent(true)} /></Card>}
      {step === 'used' && <Card><Text>You have used today’s voice time. It starts again tomorrow.</Text></Card>}
      {step === 'ready' && <Talk family={family} graph={graph} remaining={status.remainingSeconds} onUsed={(remainingSeconds) => query.replace((old) => ({ ...old, status: { ...old.status, remainingSeconds } }))} onRefused={query.refresh} />}
      <ErrorText>{error}</ErrorText>
      {(step === 'ready' || step === 'used') && <Button variant="outline" title="Withdraw my consent" disabled={busy} onPress={() => confirm('Withdraw your consent?', 'You can’t call until you agree again.', 'Withdraw', () => void setConsent(false))} />}
      {status.enabled && status.canManage && <Button variant="outline" title="Turn off for family" disabled={busy} onPress={() => confirm('Turn off voice?', 'Nobody in this family can call until you turn it on again.', 'Turn off', () => void setEnabled(false))} />}
      <Button variant="outline" title="Back to Family Base" onPress={() => router.back()} />
    </Page>
  );
}

// What is said stays in memory and is gone when the call ends. Recordings are removed as soon as they are sent.
function Talk({ family, graph, remaining, onUsed, onRefused }: { family: Family; graph: BaseGraph; remaining: number; onUsed: (seconds: number) => void; onRefused: () => void }) {
  const { access_token } = useSignedIn(), token = useRef(access_token);
  token.current = access_token;
  const [stage, setStage] = useState<Stage>('idle'), [last, setLast] = useState<Reply>(), [error, setError] = useState(''), [denied, setDenied] = useState(false), [elapsed, setElapsed] = useState(0);
  const phase = useRef<Stage>('idle'), generation = useRef(0), turns = useRef<VoiceTurn[]>([]), lease = useRef<MediaLease | null>(null), player = useRef<AudioPlayer | null>(null), sound = useRef<{ remove: () => void } | null>(null);
  const request = useRef<AbortController | null>(null), meter = useRef<ReturnType<typeof setInterval>>(undefined), file = useRef<string | null>(null), recorder = useAudioRecorder(options), began = useRef(0), mounted = useRef(true);
  const change = useCallback((next: Stage) => { phase.current = next; if (mounted.current) setStage(next); }, []);
  const quiet = useCallback(() => {
    clearInterval(meter.current);
    request.current?.abort();
    try { player.current?.remove(); } catch { /* Already gone. */ }
    player.current = null; sound.current?.remove(); sound.current = null;
  }, []);
  const stopRecorder = useCallback(async () => {
    clearInterval(meter.current);
    try { if (recorder.getStatus().canRecord || recorder.isRecording) await recorder.stop(); } catch { /* Never started. */ }
    const uri = recorder.uri ?? file.current;
    file.current = null;
    return uri;
  }, [recorder]);
  const hangUp = useCallback(() => {
    generation.current += 1;
    quiet();
    void stopRecorder().then((uri) => { discardRecording(uri); void setAudioModeAsync({ allowsRecording: false }).catch(() => {}); });
    lease.current?.release();
    turns.current = [];
    change('idle');
  }, [change, quiet, stopRecorder]);
  // Android's own permission question briefly covers the app; that is not leaving it.
  const asking = useRef(false), leave = useCallback(() => { if (!asking.current) hangUp(); }, [hangUp]);
  useMediaScope(leave);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // A call ends by itself, so one left open does not use up the day.
  useEffect(() => {
    if (stage === 'idle') return;
    const timer = setInterval(() => { const seconds = Math.round((Date.now() - began.current) / 1000); setElapsed(seconds); if (seconds >= voiceLimits.callSeconds && phase.current !== 'speaking') { hangUp(); setError('This call reached five minutes. Call again to go on.'); } }, 1000);
    return () => clearInterval(timer);
  }, [stage, hangUp]);

  const listen = useCallback(async () => {
    const mine = generation.current, alive = () => mine === generation.current && mounted.current && !!lease.current?.current();
    quiet();
    try {
      await setAudioModeAsync({ allowsRecording: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix', playsInSilentMode: true });
      await recorder.prepareToRecordAsync({ ...options, fileName: 'famsync-voice-' + randomUUID() });
      file.current = recorder.uri;
      if (!alive()) { discardRecording(await stopRecorder()); return; }
      recorder.record();
      change('listening');
      const gate = speechGate();
      meter.current = setInterval(() => {
        if (!alive() || phase.current !== 'listening') { clearInterval(meter.current); return; }
        const level = recorder.getStatus().metering;
        // Without a loudness reading, the person ends each turn with the button.
        if (level === undefined) return;
        const heard = gate.hear(level, Date.now());
        if (heard === 'done') void send.current();
        else if (heard === 'silent') { clearInterval(meter.current); void stopRecorder().then(discardRecording); change('paused'); }
      }, 100);
    } catch {
      if (!alive()) return;
      discardRecording(await stopRecorder());
      hangUp();
      setError('We couldn’t use the microphone. It may be in use by another app. Try again.');
    }
  }, [change, hangUp, quiet, recorder, stopRecorder]);

  const send = useRef<() => Promise<void>>(async () => {});
  send.current = async () => {
    if (phase.current !== 'listening') return;
    const mine = generation.current, alive = () => mine === generation.current && mounted.current;
    change('thinking');
    const uri = await stopRecorder();
    if (!uri || !alive()) { discardRecording(uri); if (alive()) change('paused'); return; }
    const controller = new AbortController();
    request.current = controller;
    try {
      const reply = await uploadFile<Reply>({ path: '/api/v1/families/' + family.id + '/base/voice/turns', fields: { turns: JSON.stringify(turns.current) }, file: { uri, name: 'voice.m4a', type: 'audio/mp4' }, token: token.current, signal: controller.signal, onProgress: () => {}, limit: 2, isReply: (body) => typeof body.answer === 'string' });
      if (!alive()) return;
      turns.current = keepTurns(turns.current, { you: reply.heard, reply: reply.answer });
      setLast(reply); setError(''); onUsed(reply.remainingSeconds);
      if (reply.remainingSeconds <= 0) return hangUp();
      await answer(reply);
    } catch (problem) {
      if (!alive() || controller.signal.aborted) return;
      setError(problem instanceof Error ? problem.message : 'We couldn’t get an answer. Try again.');
      change('paused');
      onRefused();
    } finally { discardRecording(uri); }
  };

  async function answer(reply: Reply) {
    const mine = generation.current, alive = () => mine === generation.current && mounted.current && !!lease.current?.current();
    if (!reply.audio) return change('paused');
    try {
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, interruptionMode: 'doNotMix', playsInSilentMode: true });
      if (!alive()) return;
      const made = soundFile(reply.audio), engine = createAudioPlayer({ uri: made.uri });
      sound.current = made; player.current = engine;
      change('speaking');
      engine.addListener('playbackStatusUpdate', (status) => { if (status.didJustFinish && player.current === engine && alive() && phase.current === 'speaking') void listen(); });
      engine.play();
    } catch { if (alive()) { setError('The answer couldn’t be played. It is shown below.'); change('paused'); } }
  }

  async function call() {
    if (phase.current !== 'idle') return;
    setError(''); setDenied(false); setLast(undefined); setElapsed(0);
    change('starting');
    const mine = ++generation.current;
    try {
      let permission = await AudioModule.getRecordingPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) { asking.current = true; try { permission = await AudioModule.requestRecordingPermissionsAsync(); } finally { asking.current = false; } }
      if (mine !== generation.current || !mounted.current) return;
      if (!permission.granted) { change('idle'); setDenied(true); return setError('Allow FamSync to use the microphone in your phone’s settings, then call again.'); }
      lease.current = await claimMedia(hangUp);
      if (mine !== generation.current || !lease.current.current()) return change('idle');
      began.current = Date.now();
      await listen();
    } catch { hangUp(); setError('The call couldn’t start. Try again.'); }
  }
  const sources = (last?.nodeIds ?? []).flatMap((id) => graph.nodes.find((node) => node.id === id) ?? []), live = stage !== 'idle';
  return <>
    <View style={{ alignItems: 'center', gap: 8 }}><Mascot size={170} mood={stage === 'thinking' ? 'think' : stage === 'speaking' ? 'cheer' : 'wave'} />
      <Text size={18} weight="600" accessibilityLiveRegion="polite">{live ? stageText[stage] : 'Hello! What would you like to know?'}</Text>
      <Text muted size={13}>{live ? mediaTime(elapsed) + ' · ' + minutesLeft(remaining) : minutesLeft(remaining)}</Text></View>
    {!live && <Button title="Call" icon="call-outline" onPress={() => void call()} />}
    {stage === 'listening' && <Button title="Done talking" onPress={() => void send.current()} />}
    {stage === 'speaking' && <Button variant="outline" title="Interrupt and talk" onPress={() => void listen()} />}
    {stage === 'paused' && <Button title="Talk" icon="mic-outline" onPress={() => { setError(''); void listen(); }} />}
    {live && <Button variant="outline" title="End call" onPress={hangUp} />}
    <ErrorText>{error}</ErrorText>
    {denied && <Button variant="outline" title="Open settings" onPress={() => void Linking.openSettings()} />}
    {last && <Card accessibilityLiveRegion="polite"><Text muted>{'You: ' + last.heard}</Text><Text selectable>{last.answer}</Text>
      {sources.map((node) => <LinkRow key={node.id} icon="link-outline" title={node.name} note={singularLabels[node.kind]} onPress={() => openBaseNode(node)} />)}
      <Text muted size={13}>Spoken by AI. Check the records before relying on it.</Text></Card>}
  </>;
}
