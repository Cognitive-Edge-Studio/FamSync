import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Loading, Notice } from '@/components/ui';
import { ApiError, getApi, required } from '@/lib/api';
import { useFamilyState } from '@/lib/family';
import { noticeTarget } from '@/lib/notice-rules';
import { useNotices } from '@/lib/notices';
import { pushLink } from '@/lib/push-rules';
import { useSignedIn } from '@/lib/session';

/** A notification carries no route or text. Resolve it with a fresh authorized request, even after cold start. */
export default function OpenPush() {
  const params = useLocalSearchParams(), link = pushLink(params), { access_token, user } = useSignedIn(), { state } = useFamilyState(), { refresh } = useNotices();
  const [problem, setProblem] = useState<'lost' | 'offline' | 'failed'>(), [attempt, setAttempt] = useState(0);
  const family = state.status === 'ready' ? state.family.id : null;
  const notificationId = link?.notificationId, recipient = link?.recipientId, from = link?.familyId;
  useEffect(() => {
    if (state.status === 'loading') return;
    const controller = new AbortController();
    setProblem(undefined);
    async function open() {
      if (!notificationId || recipient !== user.id || from !== family) { setProblem('lost'); return; }
      try {
        const { items } = required(await getApi(access_token).GET('/api/v1/notifications', { params: { query: { id: notificationId, limit: 1 } }, signal: controller.signal }));
        if (controller.signal.aborted) return;
        const target = items[0] ? noticeTarget(items[0].path, family, []) : null;
        if (!target) { setProblem('lost'); return; }
        router.replace(target as Parameters<typeof router.replace>[0]);
        void getApi(access_token).POST('/api/v1/notifications/read', { body: { ids: [notificationId] } }).then(refresh).catch(() => {});
      } catch (error) {
        if (!controller.signal.aborted) setProblem(error instanceof ApiError && error.status !== 0 ? 'failed' : 'offline');
      }
    }
    void open();
    return () => controller.abort();
  }, [notificationId, recipient, from, family, state.status, access_token, user.id, attempt, refresh]);
  return <><Stack.Screen options={{ title: 'Notification' }} />{problem
    ? <Notice icon={problem === 'lost' ? 'lock-closed-outline' : 'cloud-offline-outline'} title={problem === 'lost' ? 'This item is unavailable' : problem === 'offline' ? 'You’re offline' : 'This notification couldn’t open'} action={problem === 'lost' ? { title: 'Open notifications', onPress: () => router.replace('/notifications') } : { title: 'Try again', onPress: () => setAttempt((old) => old + 1) }}>{problem === 'lost' ? 'It may have been removed, belong to another account or family, or you may no longer have access.' : 'Check your connection and try again.'}</Notice>
    : <Loading label="Opening notification…" />}</>;
}
