"use client";

import type { Session } from "@supabase/auth-js";
import { useEffect, useState } from "react";
import { getBrowserAuth, recoveryMarker, signOutHere } from "@/lib/browser-auth";
import { AccountSecurityForm } from "./account-security-form";
import { AppShell } from "./app-shell";
import { NotificationPreferences } from "./notification-preferences";
import { ChatPrivacy } from "./chat-privacy";
import { PushPreferences } from "./push-preferences";
import { PrivacyPreferences } from "./privacy-preferences";
import { ProfileForm } from "./profile-form";
import { ProfileActivity } from "./profile-activity";
import { Button, ButtonLink } from "./ui/button";
import { Tabs } from "@base-ui/react/tabs";
import { Bell, Eye, Lock, UserRound } from "lucide-react";
import { PageHeader } from "./ui/page-header";

const tabs = [["profile", "Profile", UserRound], ["privacy", "Privacy", Eye], ["notifications", "Notifications", Bell], ["security", "Sign-in & security", Lock]] as const;
type Tab = typeof tabs[number][0];
const tabClass = "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 [&_svg]:size-4 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 data-[active]:bg-panel data-[active]:text-foreground data-[active]:shadow-xs";

export function AccountScreen() {
  const [session, setSession] = useState<Session | null>();
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [tab, setTab] = useState<Tab>("profile");
  useEffect(() => {
    const fromHash = () => { const hash = window.location.hash.slice(1); if (tabs.some(([value]) => value === hash)) setTab(hash as Tab); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  function choose(value: Tab) {
    setTab(value);
    window.history.replaceState(window.history.state, "", "#" + value);
  }

  useEffect(() => {
    try {
      const { data: { subscription } } = getBrowserAuth().onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      });
      return () => subscription.unsubscribe();
    } catch {
      setError("Sign-in is temporarily unavailable. Try again in a moment.");
      setSession(null);
    }
  }, []);

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const { error } = await signOutHere();
      if (error) throw error;
      sessionStorage.removeItem(recoveryMarker);
      setSession(null);
    } catch {
      setError("We couldn’t sign you out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  const email = session?.user.email;

  return (
    <AppShell activePage="account">
      <div className="pb-4">
        <PageHeader title="Your account" description={session?.user.email ?? "Profile, privacy, notifications and sign-in"}
          actions={session && <Button variant="outline" disabled={signingOut} onClick={() => void signOut()}>Sign out</Button>} />
        {error && <p className="mt-4 text-destructive" role="alert">{error}</p>}
        {session === undefined && <p className="mt-6 text-muted-foreground" role="status">Loading your account…</p>}
        {session === null && !error && (
          <section className="mt-6 rounded-2xl border border-border bg-panel p-6">
            <p className="text-muted-foreground">Sign in to view and manage your account.</p>
            <ButtonLink href="/sign-in/" className="mt-4">Sign in</ButtonLink>
          </section>
        )}
        {session && (
          <Tabs.Root value={tab} onValueChange={(value) => choose(value as Tab)}>
            <Tabs.List aria-label="Account sections" className="mb-5 flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-1">
              {tabs.map(([value, label, Icon]) => <Tabs.Tab key={value} value={value} className={tabClass}><Icon aria-hidden="true" className="hidden sm:block" />{label}</Tabs.Tab>)}
            </Tabs.List>
            <Tabs.Panel value="profile" keepMounted className="grid gap-5 outline-none data-[hidden]:hidden lg:grid-cols-2 lg:items-start">
              <ProfileForm key={session.user.id} userId={session.user.id} />
              <ProfileActivity key={session.user.id + "-activity"} accessToken={session.access_token} />
            </Tabs.Panel>
            <Tabs.Panel value="privacy" keepMounted className="grid gap-5 outline-none data-[hidden]:hidden">
              <PrivacyPreferences key={session.user.id + "-privacy"} accessToken={session.access_token} />
              <ChatPrivacy key={session.user.id + "-chat"} accessToken={session.access_token} />
            </Tabs.Panel>
            <Tabs.Panel value="notifications" keepMounted className="grid gap-5 outline-none data-[hidden]:hidden">
              <PushPreferences key={session.user.id + "-push"} accessToken={session.access_token} userId={session.user.id} />
              <NotificationPreferences key={session.user.id + "-notifications"} accessToken={session.access_token} />
            </Tabs.Panel>
            <Tabs.Panel value="security" keepMounted className="outline-none data-[hidden]:hidden">
              {email && (
                <section className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
                  <h2 className="text-lg font-semibold">Sign-in details</h2>
                  <p className="mt-2 mb-5 text-sm break-all text-muted-foreground">{email}</p>
                  <div className="grid gap-5 lg:grid-cols-2"><AccountSecurityForm kind="email" email={email} />
                    <AccountSecurityForm kind="password" email={email} /></div>
                </section>
              )}
            </Tabs.Panel>
          </Tabs.Root>
        )}
      </div>
    </AppShell>
  );
}
