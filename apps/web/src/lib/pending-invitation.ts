"use client";

const key = "famsync-pending-invitation";
const guestKey='famsync-pending-guest-invitation';
const lifetime = 24 * 60 * 60 * 1000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function clearPendingInvitation() {
  clear(key);
}
export function clearGuestInvitation(){clear(guestKey);}
function clear(storageKey:string){
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Storage may be disabled by the browser.
  }
}

function readPendingInvitation(storageKey=key): string | null {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    if (saved && typeof saved === "object" && "token" in saved && "until" in saved
      && typeof saved.token === "string" && tokenPattern.test(saved.token)
      && typeof saved.until === "number" && saved.until > Date.now()) {
      return saved.token;
    }
  } catch {
    // The email link can be reopened if storage is unavailable.
  }
  clear(storageKey);
  return null;
}

export function capturePendingInvitation(): string | null {
  return capture(key);
}
export function captureGuestInvitation(){return capture(guestKey);}
function capture(storageKey:string):string|null{
  const url = new URL(window.location.href);
  const candidate = new URLSearchParams(url.hash.slice(1)).get("token");
  if (candidate === null) return readPendingInvitation(storageKey);

  url.hash = "";
  window.history.replaceState(null, "", url);
  if (!tokenPattern.test(candidate)) {
    clear(storageKey);
    return null;
  }
  try {
    clear(storageKey===guestKey?key:guestKey);
    window.localStorage.setItem(storageKey, JSON.stringify({ token: candidate, until: Date.now() + lifetime }));
  } catch {
    // A signed-in user can still accept directly from this page.
  }
  return candidate;
}

export function postAuthPath() {
  return readPendingInvitation(guestKey)?'/join-channel/':readPendingInvitation() ? "/join/" : "/account/";
}
