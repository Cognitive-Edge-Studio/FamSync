import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { safeName } from "./file-rules";

const folder = () => new Directory(Paths.cache, "shared");
/** Shared copies are removed before the next one, and on sign-out. */
export function clearShared() { try { const shared = folder(); if (shared.exists) shared.delete(); } catch { /* Nothing was shared. */ } }

export async function shareFile(url: string, name: string, mime: string) {
  clearShared();
  const shared = folder();
  shared.create({ intermediates: true });
  const file = await File.downloadFileAsync(url, new File(shared, safeName(name)));
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}
