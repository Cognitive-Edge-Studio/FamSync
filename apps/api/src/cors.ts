const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

export function getAllowedWebOrigins(): Set<string> {
  const configured = process.env.WEB_ORIGINS;
  const origins = configured === undefined
    ? process.env.NODE_ENV === "production" ? [] : localOrigins
    : configured.split(",").map((origin) => origin.trim()).filter(Boolean);

  for (const origin of origins) {
    const url = URL.parse(origin);
    if (!url || !["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error("WEB_ORIGINS must contain HTTP(S) origins without paths, credentials, or wildcards.");
    }
  }
  return new Set(origins);
}
