"use client";

import { Popover } from "@base-ui/react/popover";
import { ModuleIcon, type ModuleIconName } from "./ui/module-icon";
import { useEffect, useState } from "react";
import { getBrowserApi, getBrowserAuth } from "@/lib/browser-auth";
import { announceNotifications, kindLabels, notificationDetail, type Notification, type NotificationList } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { floatingPanel } from "./ui/floating";

async function accessToken() {
  const { data: { session } } = await getBrowserAuth().getSession();
  return session?.access_token;
}

function iconFor(item: Notification): ModuleIconName {
  if (item.kind === "message" || item.kind === "mention") return "messages";
  if (item.kind === "assigned" || item.kind === "unassigned") return "account";
  return item.sourceKind === "event" ? "calendar" : "tasks";
}

// The bell shows the unread count (checked once a minute) and opens a preview of the latest notifications.
export function NotificationBell({ active }: { active: boolean }) {
  const [unread, setUnread] = useState<number>();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<NotificationList>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        const token = await accessToken();
        if (!token) return setUnread(undefined);
        const { data } = await getBrowserApi(token).GET("/api/v1/notifications/unread-count");
        if (!stopped && data) setUnread(data.unread);
      } catch {
        // The bell stays quiet until the next check.
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    const refresh = () => void check();
    window.addEventListener("famsync:notifications", refresh);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("famsync:notifications", refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError("");
    (async () => {
      try {
        const token = await accessToken();
        if (!token) throw new Error("Signed out");
        const { data } = await getBrowserApi(token).GET("/api/v1/notifications", { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!data) throw new Error("Unavailable");
        setList(data);
        setUnread(data.unread);
      } catch {
        if (!controller.signal.aborted) setError("We couldn’t load your notifications.");
      }
    })();
    return () => controller.abort();
  }, [open]);

  async function markRead(ids?: string[]) {
    const token = await accessToken();
    if (!token) throw new Error("Signed out");
    const { data } = await getBrowserApi(token).POST("/api/v1/notifications/read", { body: { ids } });
    if (!data) throw new Error("Not marked");
    setUnread(data.unread);
    setList((current) => current && { unread: data.unread, items: current.items.map((item) => !ids || ids.includes(item.id) ? { ...item, read: true } : item) });
    announceNotifications();
  }

  async function openItem(item: Notification) {
    try {
      if (!item.read) await markRead([item.id]);
    } catch {
      // Opening the item matters more than the read state.
    }
    window.location.assign(item.path);
  }

  async function markAll() {
    setBusy(true);
    setError("");
    try {
      await markRead();
    } catch {
      setError("We couldn’t mark your notifications as read. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (unread === undefined) return null;
  const label = unread ? "Notifications, " + unread + " unread" : "Notifications";
  const items = list?.items.slice(0, 6) ?? [];
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label={label} title={label} data-current={active ? "page" : undefined}
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-accent data-[current=page]:bg-accent data-[popup-open]:bg-accent">
        <ModuleIcon name="notifications" />
        {unread > 0 && (
          <span aria-hidden="true" data-unread={unread}
            className="absolute top-0.5 right-0.5 grid min-w-4.5 place-items-center rounded-full bg-destructive px-1 text-[0.65rem] leading-4.5 font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Popover.Popup className={cn(floatingPanel, "w-[min(24rem,calc(100vw-1.5rem))] p-0")}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <Popover.Title className="font-semibold">Notifications</Popover.Title>
              {unread > 0 && (
                <button type="button" disabled={busy} onClick={() => void markAll()}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
                  Mark all as read
                </button>
              )}
            </div>
            <div className="max-h-[min(26rem,60dvh)] overflow-y-auto p-1.5">
              {error && <p role="alert" className="px-3 py-4 text-sm text-destructive">{error}</p>}
              {!list && !error && <p role="status" className="px-3 py-4 text-sm text-muted-foreground">Loading notifications…</p>}
              {list && items.length === 0 && (
                <div className="grid justify-items-center gap-2 px-4 py-8 text-center">
                  <span className="grid size-10 place-items-center rounded-full bg-sage text-sage-foreground"><ModuleIcon name="notifications" className="size-9" /></span>
                  <p className="text-sm font-medium">You’re all caught up</p>
                </div>
              )}
              {items.length > 0 && (
                <ul aria-label="Latest notifications" className="grid gap-0.5">
                  {items.map((item) => {
                    const icon = iconFor(item);
                    return (
                      <li key={item.id}>
                        <button type="button" onClick={() => void openItem(item)}
                          className="flex w-full min-w-0 items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent">
                          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full",
                            item.read ? "bg-muted text-muted-foreground" : "bg-sky text-sky-foreground")}>
                            <ModuleIcon name={icon} className="size-7" />
                          </span>
                          <span className="min-w-0 grow">
                            <span className={cn("block text-sm wrap-anywhere", !item.read && "font-medium")}>
                              {!item.read && <span className="sr-only">Unread: </span>}{kindLabels[item.kind]}: {item.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {notificationDetail(item)} <span aria-hidden="true">·</span> {item.familyName}
                            </span>
                          </span>
                          {!item.read && <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-foreground" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <a href="/notifications/" className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium hover:bg-accent">
              View all notifications
            </a>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
