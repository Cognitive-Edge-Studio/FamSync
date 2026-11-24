export type KeyStore = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };

// Secure storage may refuse values over 2048 bytes, and a session is larger, so it is kept in parts.
// The count is written last and read first: an interrupted write leaves no half session that could be read back.
const size = 1500;
const maxParts = 20;

export function chunkedStorage(store: KeyStore) {
  const part = (key: string, index: number) => key + "." + index;
  async function removeItem(key: string) {
    await store.remove(key);
    for (let index = 0; index < maxParts; index += 1) await store.remove(part(key, index));
  }
  return {
    async getItem(key: string) {
      const count = Number(await store.get(key));
      if (!Number.isInteger(count) || count < 1 || count > maxParts) return null;
      const parts = await Promise.all(Array.from({ length: count }, (_, index) => store.get(part(key, index))));
      return parts.some((value) => value === null) ? null : decodeURIComponent(parts.join(""));
    },
    async setItem(key: string, value: string) {
      // Encoding keeps every part plain ASCII, so characters and bytes are the same length.
      const text = encodeURIComponent(value), count = Math.ceil(text.length / size);
      if (count > maxParts) throw new Error("The session is too large to store.");
      const before = Number(await store.get(key)) || 0;
      await store.remove(key);
      for (let index = 0; index < count; index += 1) await store.set(part(key, index), text.slice(index * size, (index + 1) * size));
      await store.set(key, String(count));
      for (let index = count; index < Math.min(before, maxParts); index += 1) await store.remove(part(key, index));
    },
    removeItem,
  };
}
