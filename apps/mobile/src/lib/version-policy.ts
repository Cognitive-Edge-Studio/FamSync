import type { components } from '@famsync/api-client';

export type VersionPolicy = components['schemas']['AndroidVersionPolicyDto'];
export const offlineVersionWindow = 24 * 60 * 60 * 1000;
export type SavedVersionPolicy = { server: string; policy: VersionPolicy; checkedAt: number };
export type VersionState = { status: 'checking' | 'allowed' | 'blocked' | 'unavailable'; policy?: VersionPolicy; refreshing: boolean; cached: boolean };

export function androidBuild(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const build = Number(value);
  return Number.isSafeInteger(build) && build <= 2100000000 ? build : null;
}

export function readVersionPolicy(value: unknown): VersionPolicy {
  const policy = value as Partial<VersionPolicy> | null;
  if (!policy || typeof policy.minimumBuild !== 'number' || androidBuild(String(policy.minimumBuild)) !== policy.minimumBuild) throw new Error('Invalid Android minimum build.');
  if (policy.updateUrl !== null) {
    if (typeof policy.updateUrl !== 'string') throw new Error('Invalid Android update address.');
    const url = new URL(policy.updateUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid Android update address.');
  }
  return { minimumBuild: policy.minimumBuild, updateUrl: policy.updateUrl };
}

export function readSavedVersionPolicy(raw: string | null, server: string, now: number): SavedVersionPolicy | undefined {
  try {
    const saved = JSON.parse(raw ?? 'null') as SavedVersionPolicy | null;
    if (!saved || saved.server !== server || !Number.isSafeInteger(saved.checkedAt) || saved.checkedAt < 0 || saved.checkedAt > now) return;
    return { server, checkedAt: saved.checkedAt, policy: readVersionPolicy(saved.policy) };
  } catch { return; }
}

export function versionState(build: number, saved: SavedVersionPolicy | undefined, now: number, refreshing: boolean): VersionState {
  if (!saved) return { status: refreshing ? 'checking' : 'unavailable', refreshing, cached: false };
  // Expiry or a failed refresh must never turn a known rejected binary into an accepted one.
  const status = build < saved.policy.minimumBuild ? 'blocked'
    : now >= saved.checkedAt && now - saved.checkedAt < offlineVersionWindow ? 'allowed'
    : refreshing ? 'checking' : 'unavailable';
  return { status, policy: saved.policy, refreshing, cached: true };
}
