export class PushRetryError extends Error {
  constructor(readonly retrySeconds: number) { super('Android push delivery failed'); }
}

export function pushRetrySeconds(value: string | null, now = Date.now()) {
  const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? (Date.parse(value) - now) / 1000 : 0;
  return Math.max(60, Number.isFinite(seconds) ? Math.ceil(seconds) : 60);
}
