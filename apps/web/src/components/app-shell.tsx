"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { ModuleIcon, type ModuleIconName } from "./ui/module-icon";
import { useEffect, useState, type ReactNode } from "react";
import { getBrowserApi, getBrowserAuth } from "@/lib/browser-auth";
import { NotificationBell } from "./notification-bell";
import { AccountMenu, QuickCreate } from "./top-bar-menus";
import { ThemeMenu } from "./theme-menu";
import { FadeIn, MotionProvider } from "./ui/motion";

type Page = "home" | "today" | "calendar" | "tasks" | "goals" | "channels" | "messages" | "family-base" | "families" | "account" | "notifications" | "guests" | "folders";

type AppShellProps = {
  activePage: Page;
  guestMode?: boolean;
  /** Public screens (landing, sign-in, recovery) show a simple top bar without workspace navigation. */
  variant?: "app" | "public";
  contentLayout?: "page" | "canvas";
  children: ReactNode;
};

type NavItem = { page: Page; href: string; label: string; icon: ModuleIconName };
type NavGroup = { label: string; items: NavItem[] };

const familyNav: NavGroup[] = [
  { label: "Plan", items: [
    { page: "today", href: "/today/", label: "Today", icon: "today" },
    { page: "calendar", href: "/calendar/", label: "Calendar", icon: "calendar" },
    { page: "tasks", href: "/tasks/", label: "Tasks", icon: "tasks" },
    { page: "goals", href: "/goals/", label: "Goals", icon: "goals" },
  ] },
  { label: "Talk", items: [
    { page: "channels", href: "/channels/", label: "Channels", icon: "channels" },
    { page: "messages", href: "/messages/", label: "Messages", icon: "messages" },
    { page: "guests", href: "/guests/", label: "Guest channels", icon: "guests" },
  ] },
  { label: "Family", items: [
    { page: "family-base", href: "/family-base/", label: "Family Base", icon: "home" },
    { page: "families", href: "/families/", label: "Families", icon: "families" },
    { page: "folders", href: "/folders/", label: "Folders", icon: "folders" },
  ] },
];

// Guests only see the channels they were invited to and their own account.
const guestNav: NavGroup[] = [{ label: "Guest access", items: [{ page: "guests", href: "/guests/", label: "Guest channels", icon: "guests" }] }];
const accountItem: NavItem = { page: "account", href: "/account/", label: "Account", icon: "account" };

export const familySlotId = "famsync-family-slot";

function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <a href={href} aria-label={compact ? "FamSync" : undefined} className="inline-flex items-center gap-2.5 rounded-lg text-base font-semibold tracking-tight">
      <span className="grid size-9 place-items-center">
        <ModuleIcon name="home" className="size-9" />
      </span>
      <span className={compact ? "hidden sm:inline" : undefined}>FamSync</span>
    </a>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <a href={item.href} aria-current={active ? "page" : undefined}
      className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-foreground/80 transition-colors hover:bg-panel hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:font-medium aria-[current=page]:text-primary-foreground">
      <ModuleIcon name={item.icon} />
      <span className="truncate">{item.label}</span>
    </a>
  );
}

function Navigation({ groups, activePage }: { groups: NavGroup[]; activePage: Page }) {
  return (
    <nav aria-label="Main navigation" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => <li key={item.page}><NavLink item={item} active={activePage === item.page} /></li>)}
          </ul>
        </div>
      ))}
      <ul className="mt-auto grid gap-0.5 border-t border-border pt-4">
        <li><NavLink item={accountItem} active={activePage === "account"} /></li>
      </ul>
    </nav>
  );
}

function SkipLink() {
  return (
    <a className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-4 focus:py-2 focus:shadow"
      href="#main">
      Skip to content
    </a>
  );
}

// On guest screens, people who also belong to a family keep the family navigation; guest-only accounts see guest navigation.
function useFamilyMember(check: boolean) {
  const [member, setMember] = useState(false);
  useEffect(() => {
    if (!check) return;
    let stopped = false;
    (async () => {
      try {
        const { data: { session } } = await getBrowserAuth().getSession();
        if (!session) return;
        const { data } = await getBrowserApi(session.access_token).GET("/api/v1/families");
        if (!stopped && data && data.length > 0) setMember(true);
      } catch {
        // Guest navigation remains the safe default.
      }
    })();
    return () => { stopped = true; };
  }, [check]);
  return member;
}

export function AppShell({ activePage, children, guestMode = false, variant = "app", contentLayout = "page" }: AppShellProps) {
  const canvas = contentLayout === "canvas";
  const [menuOpen, setMenuOpen] = useState(false);
  const member = useFamilyMember(guestMode && variant === "app");
  const familyView = !guestMode || member;
  const groups = familyView ? familyNav : guestNav;

  if (variant === "public") {
    return (
      <>
        <SkipLink />
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex h-[57px] max-w-6xl items-center justify-between px-4 sm:px-6">
            <Logo />
            <div className="flex items-center gap-1"><ThemeMenu />
              <a href="/sign-in/" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent">Sign in</a></div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 sm:px-6"><MotionProvider><FadeIn>{children}</FadeIn></MotionProvider></main>
      </>
    );
  }

  return (
    <>
      <SkipLink />
      {/* Desktop sidebar: persistent from 1280 px, like the reference collapsing on smaller screens. */}
      <aside aria-label="Workspace" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar xl:flex">
        <div className="flex h-[65px] shrink-0 items-center px-7"><Logo href={familyView ? "/today/" : "/guests/"} /></div>
        <Navigation groups={groups} activePage={activePage} />
      </aside>

      {/* Smaller screens: the same navigation in a modal drawer. */}
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 xl:hidden" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col bg-sidebar shadow-xl transition-transform data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full xl:hidden">
            <div className="flex h-[57px] shrink-0 items-center justify-between pr-3 pl-7">
              <Logo href={familyView ? "/today/" : "/guests/"} />
              <Dialog.Close aria-label="Close menu" className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-panel">
                <X aria-hidden="true" className="size-5" />
              </Dialog.Close>
            </div>
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Navigation groups={groups} activePage={activePage} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Workspace frame: inset beside the sidebar on desktop, full width on smaller screens. */}
      <div className="min-h-svh xl:pl-64">
        <div className={canvas
          ? "flex h-dvh min-h-0 flex-col overflow-hidden bg-background"
          : "flex min-h-svh flex-col bg-background xl:my-2 xl:mr-2 xl:min-h-[calc(100svh-1rem)] xl:rounded-xl xl:border xl:border-border"}>
          <header className="sticky top-0 z-20 flex h-[57px] shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-5 xl:rounded-t-xl">
            <button type="button" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-accent xl:hidden">
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <div className="xl:hidden"><Logo href={familyView ? "/today/" : "/guests/"} compact /></div>
            {/* Screens scoped to one family render their family picker here. */}
            <div id={familySlotId} className="flex min-w-0 items-center" />
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              {familyView && <QuickCreate />}
              <ThemeMenu className="hidden sm:inline-flex" />
              <NotificationBell active={activePage === "notifications"} />
              <AccountMenu active={activePage === "account"} />
            </div>
          </header>
          <main id="main" tabIndex={-1} className={canvas ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden outline-none" : "w-full flex-1 px-4 pb-10 outline-none sm:px-6"}>
            <MotionProvider><FadeIn className={canvas ? "flex min-h-0 flex-1 flex-col" : undefined}>{children}</FadeIn></MotionProvider>
          </main>
        </div>
      </div>
    </>
  );
}
