// Shows FamSync push notifications. It caches nothing and never changes how pages load.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Only paths inside FamSync are opened, whatever a message contains.
function safePath(value) {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : "/notifications/";
  } catch { return "/notifications/"; }
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { /* Shown as a plain notice. */ }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // FamSync is on screen and already shows its own alerts.
    if (windows.some((client) => client.visibilityState === "visible" && client.focused)) return;
    await self.registration.showNotification(typeof data.title === "string" ? data.title : "FamSync", {
      body: typeof data.body === "string" ? data.body : "You have a new notification",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      renotify: typeof data.tag === "string" && data.silent !== true,
      silent: data.silent === true,
      icon: "/icons/3d/home@2x.webp",
      data: { path: safePath(data.path ?? "/notifications/") },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = safePath(event.notification.data?.path ?? "/notifications/");
    const windows = await self.clients.matchAll({ type: "window" });
    for (const client of windows) {
      try {
        await client.focus();
        await client.navigate(path);
        return;
      } catch { /* Try another window, then a new one. */ }
    }
    await self.clients.openWindow(path);
  })());
});
