import createClient from "openapi-fetch";
import type { paths } from "./schema";

export type { components } from "./schema";

export function createFamSyncClient(baseUrl: string, accessToken?: string, options: { fetch?: (request: Request) => Promise<Response> } = {}) {
  return createClient<paths>({
    baseUrl,
    ...options,
    headers: accessToken ? { Authorization: "Bearer " + accessToken } : undefined,
  });
}
