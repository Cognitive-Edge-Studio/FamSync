import { readCache } from "./read-cache";
import { textStore } from "./text-store";

export const cache = readCache(textStore);
