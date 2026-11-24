import { isRunningInExpoGo } from 'expo';
import * as Application from 'expo-application';
import { SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Loading, Notice, Text } from '@/components/ui';
import { getApi, required } from '@/lib/api';
import { checkedUrl } from '@/lib/config';
import { keyStore } from '@/lib/secure-store';
import { useTheme } from '@/lib/theme';
import { versionCheck } from '@/lib/version-check';
import { androidBuild, type VersionState } from '@/lib/version-policy';

/** Web/Expo Go are previews, not FamSync Android binaries. Only the development web preview can simulate a build. */
export function VersionGate({ children }: { children: ReactNode }) {
  const preview = __DEV__ && Platform.OS === 'web' ? process.env.EXPO_PUBLIC_TEST_ANDROID_BUILD : undefined;
  if (preview === undefined && (Platform.OS !== 'android' || isRunningInExpoGo())) return children;
  return <Check build={androidBuild(preview ?? Application.nativeBuildVersion)}>{children}</Check>;
}

function Check({ build, children }: { build: number | null; children: ReactNode }) {
  const { colors, dark } = useTheme(), insets = useSafeAreaInsets();
  const [state, setState] = useState<VersionState>({ status: 'checking', refreshing: true, cached: false });
  const checkRef = useRef<ReturnType<typeof versionCheck> | null>(null), [linkError, setLinkError] = useState('');
  useEffect(() => {
    if (build === null) return;
    let server: string;
    try { server = checkedUrl('EXPO_PUBLIC_API_BASE_URL', process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__); }
    catch { setState({ status: 'unavailable', refreshing: false, cached: false }); return; }
    const check = versionCheck({
      build, server, read: () => keyStore.get('famsync-android-version'), write: (raw) => keyStore.set('famsync-android-version', raw),
      remove: () => keyStore.remove('famsync-android-version'),
      fetch: (signal) => getApi('').GET('/api/v1/mobile/android/version', { signal, cache: 'no-store' }).then(required),
      changed: setState,
    });
    checkRef.current = check;
    void check.refresh();
    const app = AppState.addEventListener('change', (next) => { if (next === 'active') void check.refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void check.refresh(); }, 5 * 60_000);
    return () => { checkRef.current = null; check.stop(); app.remove(); clearInterval(timer); };
  }, [build]);
  useEffect(() => { if (build === null || state.status !== 'allowed') void SplashScreen.hideAsync(); }, [build, state.status]);
  const retry = useCallback(() => { setLinkError(''); void checkRef.current?.refresh(); }, []);
  async function update() {
    if (!state.policy?.updateUrl) return;
    setLinkError('');
    try { await Linking.openURL(state.policy.updateUrl); }
    catch { setLinkError('The update page couldn’t open. Try again, or ask the person who installed FamSync for the latest version.'); }
  }

  if (build !== null && state.status === 'allowed') return children;
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}><StatusBar style={dark ? 'light' : 'dark'} />
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>
      {build === null ? <Notice icon="warning-outline" title="Install the latest FamSync">This installation’s version couldn’t be verified. Ask the person who installed FamSync for the latest version.</Notice>
        : state.status === 'checking' ? <Loading label="Checking this version…" />
        : state.status === 'blocked' ? <>
          <Notice icon="download-outline" title="Update FamSync to continue">This version is no longer supported. Your saved sign-in and family data stay on this phone while you update.</Notice>
          {state.policy?.updateUrl ? <Button title="Get the update" onPress={() => void update()} /> : <Text muted style={{ textAlign: 'center' }}>Ask the person who installed FamSync for the latest version.</Text>}
          <View style={{ height: 12 }} /><Button title="Check again" busy={state.refreshing} onPress={retry} variant="outline" />
        </> : <>
          <Notice icon="cloud-offline-outline" title="This version couldn’t be checked">Connect to the internet so FamSync can check that this version is still supported. Your saved sign-in and family data stay on this phone.</Notice>
          <Button title="Try again" busy={state.refreshing} onPress={retry} />
        </>}
      {linkError ? <Text accessibilityLiveRegion="polite" style={{ textAlign: 'center', marginTop: 16 }}>{linkError}</Text> : null}
      {build !== null && state.status !== 'checking' ? <Text muted size={13} style={{ textAlign: 'center', marginTop: 24 }}>{'Installed build ' + build + (Application.nativeApplicationVersion ? ' · Version ' + Application.nativeApplicationVersion : '')}</Text> : null}
    </ScrollView>
  </View>;
}
