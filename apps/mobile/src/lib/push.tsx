import { router, useRootNavigationState } from 'expo-router';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useFamilyState } from './family';
import { useNotices } from './notices';
import { cancelPhonePush, resumePhonePush, stopPhonePush, syncPhonePush } from './push-device';
import { phoneNotifications, supportsPhonePush } from './push-native';
import { pushLink, type PushLink } from './push-rules';
import { useSignedIn } from './session';

type Status = 'off' | 'on' | 'denied' | 'unavailable' | 'unsupported' | 'error';
type Value = { status: Status; busy: boolean; enable: () => void; disable: () => void };
const Context = createContext<Value | null>(null);

export function PushProvider({ children }: { children: ReactNode }) {
  const { access_token, user } = useSignedIn(), { state } = useFamilyState(), { refresh } = useNotices(), navigation = useRootNavigationState();
  const family = state.status === 'ready' ? state.family.id : null;
  const [status, setStatus] = useState<Status>(supportsPhonePush ? 'off' : 'unsupported'), [busy, setBusy] = useState(false), [tap, setTap] = useState<PushLink | null>(null);
  const scope = useRef({ access_token, user: user.id, family }); scope.current = { access_token, user: user.id, family };
  const mounted = useRef(true), working = useRef(false);
  const sync = useCallback(async (ask = false) => {
    if (working.current || !scope.current.family) return;
    working.current = true; setBusy(true);
    const current = scope.current;
    try {
      const result = await syncPhonePush(current.access_token, current.user, current.family!, ask);
      if (mounted.current && scope.current.family === current.family) setStatus(result);
    } catch { if (mounted.current) setStatus('error'); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }, []);
  const disable = useCallback(async () => {
    if (working.current) return;
    working.current = true; setBusy(true);
    try { setStatus(await stopPhonePush(scope.current.access_token, scope.current.user) ? 'off' : 'error'); }
    catch { setStatus('error'); }
    finally { working.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    resumePhonePush();
    let removed = false;
    const listeners: { remove(): void }[] = [];
    void phoneNotifications().then((native) => {
      if (!native || removed) return;
      native.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }) });
      const opened = (response: import('expo-notifications').NotificationResponse) => {
        if (response.actionIdentifier !== native.DEFAULT_ACTION_IDENTIFIER) return;
        const link = pushLink(response.notification.request.content.data);
        native.clearLastNotificationResponse();
        if (link) setTap(link);
      };
      listeners.push(native.addPushTokenListener(() => void sync()), native.addNotificationReceivedListener(refresh), native.addNotificationResponseReceivedListener(opened));
      const last = native.getLastNotificationResponse();
      if (last) opened(last);
    }).catch(() => { if (!removed) setStatus('error'); });
    const app = AppState.addEventListener('change', (next) => { if (next === 'active') void sync(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void sync(); }, 60_000);
    return () => { removed = true; mounted.current = false; cancelPhonePush(); for (const listener of listeners) listener.remove(); app.remove(); clearInterval(timer); };
  }, [sync, refresh]);
  useEffect(() => { cancelPhonePush(); if (family) void sync(); }, [family, access_token, sync]);
  useEffect(() => {
    if (!tap || !navigation?.key || state.status === 'loading') return;
    router.push({ pathname: '/push', params: tap } as Parameters<typeof router.push>[0]); setTap(null);
  }, [tap, navigation?.key, state.status]);
  const value = useMemo(() => ({ status, busy, enable: () => void sync(true), disable: () => void disable() }), [status, busy, sync, disable]);
  return <Context value={value}>{children}</Context>;
}
export function usePhonePush() {
  const value = use(Context);
  if (!value) throw new Error('PushProvider is missing');
  return value;
}
