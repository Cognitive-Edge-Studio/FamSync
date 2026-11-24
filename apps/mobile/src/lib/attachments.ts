import type { components } from "@famsync/api-client";
import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { checkedUrl } from "./config";
import { attachmentProblem, documentTypes, localStamp } from "./attachment-rules";

export type Picked = { uri: string; name: string; type: string; size?: number };
type StoredFile = components["schemas"]["StoredFileDto"];

// Re-encoding makes a photo fit the limit and leaves out its hidden details, such as where it was taken.
async function photo(asset: ImagePicker.ImagePickerAsset, index: number): Promise<Picked> {
  const longest = Math.max(asset.width, asset.height), context = ImageManipulator.manipulate(asset.uri);
  if (longest > 2048) context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
  const image = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: image.uri, name: "Photo " + localStamp(new Date()) + (index ? " " + (index + 1) : "") + ".jpg", type: "image/jpeg" };
}
export async function takePhoto(): Promise<Picked[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Allow FamSync to use the camera in your phone’s settings.");
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
  return result.canceled ? [] : Promise.all(result.assets.map(photo));
}
// Android's photo picker shares only what is chosen, so no permission is asked for.
export async function choosePhotos(limit: number): Promise<Picked[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: limit > 1, selectionLimit: limit, quality: 1, exif: false });
  return result.canceled ? [] : Promise.all(result.assets.slice(0, limit).map(photo));
}
export async function chooseVideos(limit: number): Promise<Picked[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: limit > 1, selectionLimit: limit, exif: false });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset) => ({ uri: asset.uri, name: asset.fileName ?? 'Video ' + localStamp(new Date()) + '.mp4', type: asset.mimeType ?? 'video/mp4', size: asset.fileSize }));
}
export async function chooseDocuments(): Promise<Picked[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: documentTypes, multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream", size: asset.size }));
}
export { attachmentProblem };

/** Sends one file. Reusing the same ID after a lost response does not store it twice. */
export async function uploadFile<T>({ path, fields, file, token, signal, onProgress, limit = 5, isReply = (body) => !!body.id }: { path: string; fields: Record<string, string>; file?: Picked; token: string; signal: AbortSignal; onProgress: (percent: number) => void; limit?: number; isReply?: (body: Record<string, unknown>) => boolean }) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  if (file && Platform.OS === "web") form.append("file", await (await fetch(file.uri)).blob(), file.name);
  // React Native streams the file from this description.
  else if (file) form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest(), interrupted = () => reject(new Error("Upload interrupted. Try again."));
    request.open("POST", checkedUrl("EXPO_PUBLIC_API_BASE_URL", process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__) + path);
    request.setRequestHeader("Authorization", "Bearer " + token);
    request.timeout = 90_000;
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100))); };
    request.onload = () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(request.responseText); } catch { /* Reported below. */ }
      if (request.status >= 200 && request.status < 300 && isReply(body)) resolve(body as T);
      else reject(new Error(request.status === 413 ? "Choose a file up to " + limit + " MB." : typeof body.message === "string" ? body.message : "We couldn’t upload this file. Try again."));
    };
    request.onerror = interrupted;
    request.ontimeout = interrupted;
    request.onabort = interrupted;
    if (signal.aborted) return interrupted();
    signal.addEventListener("abort", () => request.abort());
    request.send(form);
  });
}
export const uploadAttachment = ({ familyId, channelId, id, voiceSeconds, ...rest }: { familyId: string; channelId: string; id: string; file: Picked; token: string; signal: AbortSignal; onProgress: (percent: number) => void; voiceSeconds?: number }) =>
  uploadFile<StoredFile>({ ...rest, path: "/api/v1/families/" + familyId + "/channels/" + channelId + "/uploads", fields: { id, ...(voiceSeconds ? { voiceSeconds: String(voiceSeconds) } : {}) } });
