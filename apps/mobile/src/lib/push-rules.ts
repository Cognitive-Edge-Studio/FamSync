const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type PushLink = { notificationId: string; familyId: string; recipientId: string };
export function pushLink(data: unknown): PushLink | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  return [value.notificationId, value.familyId, value.recipientId].every((id) => typeof id === 'string' && uuid.test(id))
    ? { notificationId: value.notificationId as string, familyId: value.familyId as string, recipientId: value.recipientId as string } : null;
}

/** Native registration and removal share a lane. Cancellation wins over in-flight setup. */
export function registrationLane() {
  let tail: Promise<unknown> = Promise.resolve(), generation = 0;
  return {
    cancel() { generation += 1; },
    run<T>(work: (current: () => boolean) => Promise<T>) {
      const mine = generation;
      const result = tail.then(() => work(() => mine === generation));
      tail = result.catch(() => {});
      return result;
    },
  };
}
