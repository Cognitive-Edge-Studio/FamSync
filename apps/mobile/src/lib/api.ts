import { createFamSyncClient } from "@famsync/api-client";
import { checkedUrl } from "./config";

export class ApiError extends Error {
  constructor(readonly status: number) { super("Request failed (" + status + ")"); }
}

// React Native's Request support varies, so the request is passed on in plain parts. Every call has a time limit.
async function plainFetch(request: Request) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  const limit = new AbortController(), timer = setTimeout(() => limit.abort(), 15_000);
  const stop = () => limit.abort();
  if (request.signal?.aborted) stop();
  request.signal?.addEventListener("abort", stop);
  try {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
    return await fetch(request.url, { method: request.method, headers, body, signal: limit.signal });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", stop);
  }
}

export function getApi(accessToken: string) {
  return createFamSyncClient(checkedUrl("EXPO_PUBLIC_API_BASE_URL", process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__), accessToken, { fetch: plainFetch });
}

export function required<T>({ data, response }: { data?: T; response: Response }): T {
  if (data === undefined) throw new ApiError(response.status);
  return data;
}
