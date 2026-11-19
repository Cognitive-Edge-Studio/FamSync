"use client";

import { Menu } from "@base-ui/react/menu";
import { LogOut, Plus } from "lucide-react";
import { ModuleIcon, type ModuleIconName } from "./ui/module-icon";
import { useEffect, useState } from "react";
import { getBrowserApi, getBrowserAuth, recoveryMarker } from "@/lib/browser-auth";
import { currentFamily, type CreateKind } from "@/lib/quick-create";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { floatingPanel, menuItem } from "./ui/floating";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { saveThemePreference, type ThemePreference } from "@/lib/theme";
import { useThemePreference } from "./theme-menu";

const createItems: { kind: CreateKind; label: string; path: string; icon: ModuleIconName }[] = [
  { kind: "task", label: "Task", path: "/tasks/", icon: "tasks" },
  { kind: "event", label: "Event", path: "/calendar/", icon: "calendar" },
  { kind: "goal", label: "Goal", path: "/goals/", icon: "goals" },
  { kind: "channel", label: "Channel", path: "/channels/", icon: "channels" },
  { kind: "dm", label: "Direct message", path: "/messages/", icon: "messages" },
];

// "New" opens the matching screen for the current family with its create dialog already open.
export function QuickCreate() {
  const [family, setFamily] = useState<string | null>(null);
  const href = (path: string, kind: CreateKind) => path + "?" + new URLSearchParams({ ...(family ? { family } : {}), new: kind });
  return (
    <Menu.Root onOpenChange={(open) => { if (open) setFamily(currentFamily()); }}>
      <Menu.Trigger aria-label="Create new"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover data-[popup-open]:bg-primary-hover sm:px-3">
        <Plus aria-hidden="true" className="size-4" /><span className="hidden sm:inline">New</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Menu.Popup className={cn(floatingPanel, "min-w-52")}>
            <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Create</p>
            {createItems.map(({ kind, label, path, icon }) => (
              <Menu.LinkItem key={kind} href={href(path, kind)} className={menuItem}><ModuleIcon name={icon} className="size-7" />{label}</Menu.LinkItem>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

type Me = { token: string; email: string; name: string; id: string };

// The account button shows the person's character avatar and opens their account menu.
export function AccountMenu({ active }: { active: boolean }) {
  const theme = useThemePreference();
  const [me, setMe] = useState<Me | null>();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const { data: { session } } = await getBrowserAuth().getSession();
        if (!session) return setMe(null);
        const base = { token: session.access_token, email: session.user.email ?? "", id: session.user.id };
        if (!stopped) setMe({ ...base, name: base.email });
        const { data } = await getBrowserApi(session.access_token).GET("/api/v1/me/profile");
        const name = [data?.firstName, data?.lastName].filter(Boolean).join(" ");
        if (!stopped && name) setMe({ ...base, name });
      } catch {
        // The stable account avatar remains available if the profile name cannot load.
      }
    })();
    return () => { stopped = true; };
  }, []);

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const { error: failure } = await getBrowserAuth().signOut({ scope: "local" });
      if (failure) throw failure;
      sessionStorage.removeItem(recoveryMarker);
      window.location.assign("/sign-in/");
    } catch {
      setError("We couldn’t sign you out. Try again.");
      setSigningOut(false);
    }
  }

  if (me === null) return null;
  return (
    <Menu.Root>
      <Menu.Trigger aria-label="Account menu" data-current={active ? "page" : undefined}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-panel text-foreground/80 transition-colors hover:bg-accent data-[current=page]:ring-2 data-[current=page]:ring-ring/40 data-[popup-open]:bg-accent">
        {me ? <Avatar name={me.name} colorKey={me.id} className="size-full" /> : <ModuleIcon name="account" />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Menu.Popup className={cn(floatingPanel, "w-64")}>
            {me && (
              <div className="flex items-center gap-3 px-2.5 py-2">
                <Avatar name={me.name} colorKey={me.id} />
                <div className="min-w-0">
                  {me.name !== me.email && <p className="truncate text-sm font-medium">{me.name}</p>}
                  <p className={cn("truncate", me.name !== me.email ? "text-xs text-muted-foreground" : "text-sm font-medium")}>{me.email}</p>
                </div>
              </div>
            )}
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.LinkItem href="/account/" className={menuItem}><ModuleIcon name="account" className="size-7" />Account</Menu.LinkItem>
            <Menu.LinkItem href="/families/" className={menuItem}><ModuleIcon name="families" className="size-7" />Families</Menu.LinkItem>
            <Menu.Separator className="my-1 h-px bg-border" />
            <p className="px-2.5 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">Appearance</p>
            <Menu.RadioGroup value={theme.preference} onValueChange={(value) => saveThemePreference(value as ThemePreference)}>
              {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as const).map(([value, label, Icon]) => (
                <Menu.RadioItem key={value} value={value} closeOnClick={false} className={menuItem}>
                  <Icon aria-hidden="true" />{label}<Menu.RadioItemIndicator className="ml-auto"><Check aria-hidden="true" /></Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item className={menuItem} disabled={signingOut} closeOnClick={false} onClick={() => void signOut()}>
              <LogOut aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}
            </Menu.Item>
            {error && <p role="alert" className="px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
