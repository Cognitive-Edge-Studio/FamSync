"use client";

import type { Session } from "@supabase/auth-js";
import { BellRing, CalendarDays, ListChecks, MessageCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { announceNotifications as announce, kindLabels, notificationDetail as detail, type Notification, type NotificationList } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { FormFeedback } from "./account-fields";
import { AppShell } from "./app-shell";
import { FamilySession } from "./family-session";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { PageHeader } from "./ui/page-header";

function Inbox({ session }: { session: Session }) {
  const [list, setList] = useState<NotificationList>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getBrowserApi(session.access_token).GET("/api/v1/notifications", { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data) setList(data);
        else setError("We couldn’t load your notifications.");
      })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your notifications."); });
    return () => controller.abort();
  }, [session.access_token]);

  async function markRead(ids?: string[]) {
    const { data } = await getBrowserApi(session.access_token).POST("/api/v1/notifications/read", { body: { ids } });
    if (!data) throw new Error("Not marked");
    setList((current) => current && {
      unread: data.unread,
      items: current.items.map((item) => !ids || ids.includes(item.id) ? { ...item, read: true } : item),
    });
    announce();
  }

  async function open(item: Notification) {
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

  return (
    <div className="grid gap-5">
      <PageHeader className="mb-0" title="Notifications" description={list?.unread ? list.unread + " unread" : undefined}
        actions={list && list.unread > 0 && <Button variant="outline" disabled={busy} onClick={() => void markAll()}>Mark all as read</Button>} />
      <FormFeedback error={error} />
      {!list && !error && <FormFeedback note="Loading notifications…" />}
      {list && list.items.length === 0 && (
        <EmptyState icon="notifications" tone="sage" title="No notifications yet">Reminders and changes to your tasks and events will show up here.</EmptyState>
      )}
      {list && list.items.length > 0 && (
        <ul className="grid gap-0.5 rounded-2xl border border-border bg-panel p-2" aria-label="Notifications">
          {list.items.map((item) => {
            const Icon = item.kind === "message" || item.kind === "mention" ? MessageCircle : item.kind === "assigned" || item.kind === "unassigned" ? UserRound
              : item.sourceKind === "event" ? CalendarDays : ListChecks;
            return (
              <li key={item.id}>
                <button type="button" onClick={() => void open(item)}
                  className="flex w-full min-w-0 items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-accent">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", item.read ? "bg-muted text-muted-foreground" : "bg-sky text-sky-foreground")}>
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 grow">
                    <span className={cn("block text-sm wrap-anywhere", item.read ? "font-normal" : "font-semibold")}>
                      {!item.read && <span className="sr-only">Unread: </span>}{kindLabels[item.kind]}: {item.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {detail(item)} <span aria-hidden="true">·</span> {item.familyName}
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
  );
}

export function NotificationsScreen() {
  return (
    <AppShell activePage="notifications">
      <div className="mx-auto max-w-3xl pb-4">
        <FamilySession>{(session) => <Inbox key={session.user.id} session={session} />}</FamilySession>
      </div>
    </AppShell>
  );
}
