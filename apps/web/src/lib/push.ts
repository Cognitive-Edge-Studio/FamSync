import { createFamSyncClient } from "@famsync/api-client";
import { defaultFamily } from "./default-family";

// This browser's choice to receive push, per account. The subscription itself lives in the browser and on the server.
const key = "famsync-push-user";
const api = (token: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new Error("FamSync is temporarily unavailable.");
  return createFamSyncClient(baseUrl, token);
};
const read = () => { try { return localStorage.getItem(key); } catch { return null; } };

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const registration = () => navigator.serviceWorker.getRegistration("/push-worker.js");
async function currentSubscription() {
  if (!pushSupported()) return null;
  return (await (await registration())?.pushManager.getSubscription()) ?? null;
}
export async function pushEnabled(userId: string) {
  return pushSupported() && Notification.permission === "granted" && read() === userId && !!(await currentSubscription());
}

function keyBytes(value: string) {
  const text = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}
const sameKey = (saved: ArrayBuffer | null | undefined, wanted: Uint8Array) => {
  const bytes = saved ? new Uint8Array(saved) : undefined;
  return !!bytes && bytes.length === wanted.length && bytes.every((byte, index) => byte === wanted[index]);
};

async function register(token: string, userId: string, publicKey: string) {
  await navigator.serviceWorker.register("/push-worker.js");
  const ready = await navigator.serviceWorker.ready, wanted = keyBytes(publicKey);
  let subscription = await ready.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, wanted)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
  const { keys } = subscription.toJSON();
  if (!keys?.p256dh || !keys.auth) throw new Error("This browser’s push service is not supported.");
  const { data: families } = await api(token).GET("/api/v1/families");
  const { data, error } = await api(token).PUT("/api/v1/me/push", {
    body: { familyId: families ? defaultFamily(families)?.id ?? null : null, endpoint: subscription.endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  if (!data) throw new Error((error as { message?: string } | undefined)?.message ?? "We couldn’t turn on push. Try again.");
  try { localStorage.setItem(key, userId); } catch { /* Push still works; it must be turned on again after a reload. */ }
}

/** Call from a click: browsers only ask for permission then. */
export async function enablePush(token: string, userId: string, publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for FamSync. Allow them in your browser’s site settings, then try again.");
  await register(token, userId, publicKey);
}

/** Keeps the server's copy current. Browsers replace addresses from time to time. */
export async function refreshPush(token: string, userId: string) {
  try {
    if (!pushSupported() || Notification.permission !== "granted" || read() !== userId) return;
    if (sessionStorage.getItem(key) === userId) return;
    const { data } = await api(token).GET("/api/v1/me/push");
    if (!data?.publicKey) return;
    await register(token, userId, data.publicKey);
    sessionStorage.setItem(key, userId);
  } catch { /* The next visit tries again. */ }
}

/** Removes this browser from the server and from the push service. Without a token the push service alone ends it. */
export async function forgetPush(token?: string) {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch { /* Nothing was stored. */ }
  try {
    const subscription = await currentSubscription();
    if (!subscription) return true;
    const removed = token ? await api(token).DELETE("/api/v1/me/push", { body: { endpoint: subscription.endpoint }, signal: AbortSignal.timeout(4000) }).then(({ data }) => !!data, () => false) : false;
    const ended = await subscription.unsubscribe();
    return removed || ended;
  } catch { return false; }
}
