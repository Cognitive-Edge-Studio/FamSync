import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { GoTrueClient, isAuthRetryableFetchError } from "@supabase/auth-js";
import { readSaved } from "../src/lib/saved-session.ts";
import { chunkedStorage } from "../src/lib/secure-chunks.ts";

// The saved session is exercised with the real auth client against a small local auth server.
const jwt = (seconds: number) => ["{}", JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) + seconds })].map((part) => Buffer.from(part).toString("base64url")).join(".") + ".sig";
function saved(expiresIn: number) {
  return JSON.stringify({ access_token: jwt(expiresIn), refresh_token: "r1", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + expiresIn, user: { id: "u1", email: "a@test.test", padding: "x".repeat(4000) } });
}
function device() {
  const values = new Map<string, string>();
  return { values, storage: chunkedStorage({ get: async (key) => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, remove: async (key) => { values.delete(key); } }) };
}
const open = (url: string, storage: ReturnType<typeof device>["storage"]) => new GoTrueClient({ url, storageKey: "s", storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false });
async function server(status: number, body: object) {
  const http = createServer((_request, response) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); }).listen(0, "127.0.0.1");
  await new Promise((done) => http.once("listening", done));
  return { url: "http://127.0.0.1:" + (http.address() as AddressInfo).port, close: () => { http.closeAllConnections(); http.close(); } };
}

test("a restart keeps the session", async () => {
  const { storage } = device();
  await storage.setItem("s", saved(3600));
  const { data } = await open("http://127.0.0.1:9", storage).getSession();
  assert.equal(data.session?.user.id, "u1");
});

test("an expired session offline is kept, and reported as a connection problem", { timeout: 60_000 }, async () => {
  const { storage, values } = device();
  await storage.setItem("s", saved(-60));
  const { data, error } = await open("http://127.0.0.1:9", storage).getSession();
  assert.equal(data.session, null);
  assert.equal(isAuthRetryableFetchError(error), true);
  assert.ok(values.size > 0);
  // The person can still read saved data as themselves.
  assert.equal(readSaved(await storage.getItem("s"))?.user.id, "u1");
  for (const bad of [null, "{", "{}", JSON.stringify({ user: { id: "x" } })]) assert.equal(readSaved(bad), null);
});

test("a refused session is removed from the device", async () => {
  const { storage, values } = device(), auth = await server(400, { code: "refresh_token_not_found", message: "Invalid Refresh Token" });
  try {
    await storage.setItem("s", saved(-60));
    const { data } = await open(auth.url, storage).getSession();
    assert.equal(data.session, null);
    assert.equal(values.size, 0);
  } finally { auth.close(); }
});
