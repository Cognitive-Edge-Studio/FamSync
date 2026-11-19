import createClient from "openapi-fetch";
import type { paths } from "./schema";

export type { components } from "./schema";

export function createFamSyncClient(baseUrl: string, accessToken?: string) {
  return createClient<paths>({
    baseUrl,
    headers: accessToken ? { Authorization: "Bearer " + accessToken } : undefined,
  });
}
