import { randomUUID } from 'expo-crypto';
import { getApi, required } from './api';
import { phoneNotifications } from './push-native';
import { registrationLane } from './push-rules';
import { keyStore } from './secure-store';
import { chunkedStorage } from './secure-chunks';

const lane = registrationLane(), idKey = 'famsync-push-device';
let suspended = false;
const proofs = chunkedStorage(keyStore), proofKey = 'famsync-push-proof', pendingKey = 'famsync-push-removal';
async function removePending() {
  const saved = await proofs.getItem(pendingKey);
  if (!saved) return;
  const body = JSON.parse(saved) as { deviceId: string; token: string };
  required(await getApi('').POST('/api/v1/push/android/revoke', { body }));
  await proofs.removeItem(pendingKey);
}
export const retryPhonePushRemoval = () => lane.run(removePending);
const enabledKey = (user: string) => 'famsync-push-enabled-' + user;
export const phonePushEnabled = (user: string) => keyStore.get(enabledKey(user)).then((value) => value === '1');
export const cancelPhonePush = () => lane.cancel();
export const resumePhonePush = () => { suspended = false; };

export async function syncPhonePush(access: string, user: string, family: string, ask = false) {
  if (ask) suspended = false;
  return lane.run(async (current) => {
    if (!current()) return 'off' as const;
    await removePending();
    if (suspended) return 'off' as const;
    const native = await phoneNotifications();
    if (!native) return 'unsupported' as const;
    if (!ask && !await phonePushEnabled(user)) return 'off' as const;
    if (!required(await getApi(access).GET('/api/v1/me/push/android')).available) return 'unavailable' as const;
    await native.setNotificationChannelAsync('famsync-updates', { name: 'Family updates', importance: native.AndroidImportance.HIGH, sound: 'default', lockscreenVisibility: native.AndroidNotificationVisibility.PRIVATE });
    await native.setNotificationChannelAsync('famsync-quiet', { name: 'Updates during quiet hours', importance: native.AndroidImportance.LOW, sound: null, enableVibrate: false, lockscreenVisibility: native.AndroidNotificationVisibility.PRIVATE });
    let permission = await native.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain && ask && current()) permission = await native.requestPermissionsAsync();
    let deviceId = await keyStore.get(idKey);
    if (!permission.granted) {
      if (deviceId && current()) required(await getApi(access).DELETE('/api/v1/me/push/android', { body: { deviceId } }));
      return 'denied' as const;
    }
    if (!current()) return 'off' as const;
    const token = await native.getDevicePushTokenAsync();
    if (token.type !== 'android' || typeof token.data !== 'string') throw new Error('Phone registration unavailable');
    if (!deviceId) { deviceId = randomUUID(); await keyStore.set(idKey, deviceId); }
    if (!current()) return 'off' as const;
    // Save proof before registration; even a lost HTTP response can be removed after sign-out.
    await proofs.setItem(proofKey, JSON.stringify({ deviceId, token: token.data }));
    required(await getApi(access).PUT('/api/v1/me/push/android', { body: { deviceId, familyId: family, token: token.data } }));
    if (current()) await keyStore.set(enabledKey(user), '1');
    return current() ? 'on' as const : 'off' as const;
  });
}

/** Called before auth tokens are discarded. Offline removal keeps only the native-token proof for retry. */
export async function stopPhonePush(access?: string, user?: string) {
  suspended = true;
  lane.cancel();
  return lane.run(async () => {
    if (user) await keyStore.remove(enabledKey(user));
    const deviceId = await keyStore.get(idKey), native = await phoneNotifications();
    let failed = false;
    const proof = await proofs.getItem(proofKey);
    if (proof) {
      await proofs.setItem(pendingKey, proof);
      await proofs.removeItem(proofKey);
      try { await removePending(); } catch { failed = true; }
    } else if (deviceId && access) {
      try { required(await getApi(access).DELETE('/api/v1/me/push/android', { body: { deviceId } })); } catch { failed = true; }
    }
    if (native) {
      await native.dismissAllNotificationsAsync().catch(() => {});
      native.clearLastNotificationResponse();
      try { await native.unregisterForNotificationsAsync(); } catch { failed = true; }
    }
    return !failed;
  });
}
