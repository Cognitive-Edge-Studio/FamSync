import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApi, required } from '@/lib/api';
import { claimMedia } from '@/lib/media-focus';
import { mediaTime, seekPosition, type MediaLease } from '@/lib/media-rules';
import { useMediaScope } from '@/lib/media-scope';
import { useSignedIn } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { ErrorText } from './form';
import { Button, Icon, Text } from './ui';

/** No media bytes or signed links are requested before Play; each new playback asks the API again. */
export function MediaAttachment({ familyId, fileId, name, kind, seconds }: { familyId: string; fileId: string; name: string; kind: 'audio' | 'video'; seconds?: number | null }) {
  const { access_token } = useSignedIn();
  const token = useRef(access_token); token.current = access_token;
  const load = useCallback(async (signal: AbortSignal) => {
    const value = required(await getApi(token.current).POST('/api/v1/families/{familyId}/files/{fileId}/preview', { params: { path: { familyId, fileId } }, signal }));
    if (!value.url) throw new Error('Media unavailable');
    return value.url;
  }, [familyId, fileId]);
  return kind === 'audio' ? <AudioPlayer label={name} seconds={seconds ?? 0} load={load} /> : <VideoPlayer label={name} load={load} />;
}

export function AudioPlayer({ label, seconds = 0, uri, load }: { label: string; seconds?: number; uri?: string; load?: (signal: AbortSignal) => Promise<string> }) {
  const [source, setSource] = useState<{ uri: string; key: number; start: number }>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const position = useRef(0), attempt = useRef(0), lease = useRef<MediaLease | null>(null), request = useRef<AbortController | null>(null), engine = useRef<(() => void) | null>(null), mounted = useRef(true);
  const stop = useCallback(() => {
    attempt.current += 1; request.current?.abort(); lease.current?.release(); engine.current?.();
    setSource(undefined); setBusy(false);
  }, []);
  useMediaScope(stop);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function begin() {
    if (busy) return;
    const owned = await claimMedia(stop); lease.current = owned;
    if (!owned.current() || !mounted.current) return;
    const mine = ++attempt.current, controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, interruptionMode: 'doNotMix', playsInSilentMode: true });
      const next = uri ?? await load!(controller.signal);
      if (!owned.current() || mine !== attempt.current || !mounted.current) return;
      setSource({ uri: next, key: mine, start: position.current });
    } catch {
      if (mine === attempt.current && mounted.current) { stop(); setError('This audio couldn’t play. Check your connection and try again.'); }
    } finally { if (mine === attempt.current && mounted.current) setBusy(false); }
  }
  return <View style={{ minWidth: 200, maxWidth: 300, gap: 6 }}>
    <Text size={13} weight="600" numberOfLines={2}>{label}</Text>
    {source ? <AudioEngine key={source.key} uri={source.uri} start={source.start} fallback={seconds} owns={() => !!lease.current?.current()} onResume={() => void begin()} onPosition={(value) => { position.current = value; }} register={(value) => { engine.current = value; }} onError={() => { stop(); setError('This audio couldn’t play. Try again to reload it.'); }} />
      : <Button variant="outline" title={'Play' + (seconds ? ' · ' + mediaTime(seconds) : '')} busy={busy} onPress={() => void begin()} />}
    <ErrorText>{error}</ErrorText>
  </View>;
}

function AudioEngine({ uri, start, fallback, owns, onResume, onPosition, register, onError }: { uri: string; start: number; fallback: number; owns: () => boolean; onResume: () => void; onPosition: (value: number) => void; register: (stop: (() => void) | null) => void; onError: () => void }) {
  const player = useAudioPlayer(uri, { updateInterval: 250, downloadFirst: false }), status = useAudioPlayerStatus(player), { colors } = useTheme();
  const begun = useRef(false), alive = useRef(true), width = useRef(1), latest = useRef({ owns, onPosition, onError }); latest.current = { owns, onPosition, onError };
  useEffect(() => {
    const pause = () => { try { latest.current.onPosition(player.duration > 0 && player.currentTime >= player.duration - 0.25 ? 0 : player.currentTime); player.pause(); } catch { /* Player has been released. */ } };
    alive.current = true;
    register(pause);
    return () => { alive.current = false; pause(); register(null); };
  }, [player]);
  useEffect(() => {
    if (status.error) { latest.current.onError(); return; }
    if (status.didJustFinish) { latest.current.onPosition(0); return; }
    if (begun.current) { latest.current.onPosition(status.currentTime); return; }
    if (!status.isLoaded) return;
    begun.current = true;
    void player.seekTo(seekPosition(start, status.duration || fallback)).then(() => { if (alive.current && latest.current.owns()) player.play(); }).catch(() => { if (alive.current) latest.current.onError(); });
  }, [status.isLoaded, status.error, status.currentTime, status.didJustFinish, player, start, fallback]);
  useEffect(() => {
    const timer = setTimeout(() => { if (!begun.current) latest.current.onError(); }, 15_000);
    return () => clearTimeout(timer);
  }, []);
  const duration = status.duration || fallback, at = seekPosition(status.currentTime, duration);
  const seek = (value: number) => { void player.seekTo(seekPosition(value, duration)).then(() => { if (alive.current) latest.current.onPosition(player.currentTime); }).catch(() => { if (alive.current) latest.current.onError(); }); };
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause audio' : 'Play audio'} onPress={() => { if (status.playing) { player.pause(); onPosition(player.currentTime); } else onResume(); }} style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}>
        {status.isBuffering || !status.isLoaded ? <ActivityIndicator color={colors.primary} /> : <Icon name={status.playing ? 'pause' : 'play'} size={26} color={colors.primary} />}
      </Pressable>
      <Button variant="outline" title="−15s" disabled={!status.isLoaded} onPress={() => seek(at - 15)} />
      <Button variant="outline" title="+15s" disabled={!status.isLoaded} onPress={() => seek(at + 15)} />
    </View>
    <Pressable accessibilityRole="adjustable" accessibilityLabel="Audio position" accessibilityValue={{ min: 0, max: Math.ceil(duration), now: Math.floor(at), text: mediaTime(at) + ' of ' + mediaTime(duration) }} accessibilityActions={[{ name: 'increment', label: 'Forward 15 seconds' }, { name: 'decrement', label: 'Back 15 seconds' }]} onAccessibilityAction={({ nativeEvent }) => seek(at + (nativeEvent.actionName === 'increment' ? 15 : -15))} onLayout={({ nativeEvent }) => { width.current = nativeEvent.layout.width || 1; }} onPress={({ nativeEvent }) => seek(nativeEvent.locationX / width.current * duration)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <View style={{ height: 5, backgroundColor: colors.muted, borderRadius: 3 }}><View style={{ width: (duration ? at / duration * 100 : 0) + '%' as `${number}%`, height: 5, borderRadius: 3, backgroundColor: colors.primary }} /></View>
      <Text muted size={13}>{mediaTime(at) + ' / ' + mediaTime(duration)}</Text>
    </Pressable>
  </View>;
}

function VideoPlayer({ label, load }: { label: string; load: (signal: AbortSignal) => Promise<string> }) {
  const [url, setUrl] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), request = useRef<AbortController | null>(null), lease = useRef<MediaLease | null>(null), generation = useRef(0), mounted = useRef(true);
  const close = useCallback(() => { generation.current += 1; request.current?.abort(); lease.current?.release(); setUrl(undefined); setBusy(false); }, []);
  useMediaScope(close);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function open() {
    const owned = await claimMedia(close); lease.current = owned;
    if (!owned.current() || !mounted.current) return;
    const mine = ++generation.current, controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try { const next = await load(controller.signal); if (owned.current() && mine === generation.current && mounted.current) setUrl(next); }
    catch { if (mine === generation.current && mounted.current) setError('This video couldn’t open. Check your connection and try again.'); }
    finally { if (mine === generation.current && mounted.current) setBusy(false); }
  }
  return <View style={{ minWidth: 200, maxWidth: 300, gap: 6 }}><Text size={13} weight="600">{label}</Text><Button variant="outline" title="Play video" busy={busy} onPress={() => void open()} /><ErrorText>{error}</ErrorText>
    {url && <Modal animationType="fade" onRequestClose={close}><VideoEngine uri={url} label={label} owns={() => !!lease.current?.current()} onClose={close} /></Modal>}
  </View>;
}

function VideoEngine({ uri, label, owns, onClose }: { uri: string; label: string; owns: () => boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets(), { colors } = useTheme(), player = useVideoPlayer(uri, (value) => { value.audioMixingMode = 'doNotMix'; value.staysActiveInBackground = false; });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status, error: undefined });
  useEffect(() => { if (status === 'readyToPlay' && owns()) player.play(); }, [player, status]);
  useEffect(() => () => { try { player.pause(); } catch { /* Already released. */ } }, [player]);
  return <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom, paddingHorizontal: 16, gap: 12, justifyContent: 'center' }}>
    <Text weight="600">{label}</Text><VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }} />
    {status === 'loading' && <ActivityIndicator color={colors.primary} />}{error && <Text accessibilityRole="alert">This video couldn’t play. Close it and try again to request a fresh link.</Text>}
    <Button variant="outline" title="Close video" onPress={onClose} />
  </View>;
}
