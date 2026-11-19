"use client";

import { GoTrueClient, type AuthError } from "@supabase/auth-js";
import { createFamSyncClient } from "@famsync/api-client";
import { z } from "zod";

let browserAuth: GoTrueClient | undefined;

function browserAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL;
  if (!url) throw new Error("Sign-in is temporarily unavailable.");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const headers: Record<string, string> = key ? { apikey: key } : {};
  return { url: url.replace(/\/$/, ""), headers };
}

export function getBrowserAuth() {
  browserAuth ??= new GoTrueClient({
    ...browserAuthConfig(),
    storageKey: "famsync-session",
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  });
  return browserAuth;
}

export async function isGoogleSignInEnabled(signal: AbortSignal) {
  const { url, headers } = browserAuthConfig();
  const response = await fetch(url + "/settings", { headers, signal, cache: "no-store" });
  if (!response.ok) return false;
  const settings: { external?: { google?: boolean } } | null = await response.json();
  return settings?.external?.google === true;
}

export function getBrowserApi(accessToken?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new Error("FamSync is temporarily unavailable.");
  return createFamSyncClient(baseUrl, accessToken);
}

export function callbackUrl(flow: "signup" | "recovery" | "email-change" | "google") {
  const url = new URL("/auth/callback/", window.location.origin);
  url.searchParams.set("flow", flow);
  return url.toString();
}

export const emailInput = z.string().trim().pipe(z.email("Enter a valid email address."));
export const passwordInput = z.string().min(8, "Use at least 8 characters.").refine(
  (value) => new TextEncoder().encode(value).length <= 72,
  "Use a shorter password.",
);

export function authMessage(error: AuthError) {
  switch (error.code) {
    case "email_not_confirmed": return "Confirm your email before signing in.";
    case "invalid_credentials": return "Check your email and password and try again.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return "Wait a moment and try again.";
    case "weak_password": return "Choose a stronger password.";
    case "same_password": return "Choose a different password.";
    case "email_exists": return "That email address is already in use.";
    default: return "We couldn’t complete that request. Please try again.";
  }
}

export const recoveryMarker = "famsync-recovery-user";
