// Public build settings. Release builds accept only HTTPS, so sign-in details never travel in plain text.
export function checkedUrl(name: string, value: string | undefined, development: boolean) {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new Error(name + " is not set to a valid address."); }
  if (url.protocol !== "https:" && !(development && url.protocol === "http:")) throw new Error(name + " must use HTTPS.");
  return url.href.replace(/\/$/, "");
}
