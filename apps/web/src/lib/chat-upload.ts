import { apiUploadUrl, type StoredFile } from "./files";

export const chatFileTypes = ".pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.m4a,.txt,.csv";
export const chatFileLimit = 5 * 1048576;

/** Checks that can be made before sending anything; the server checks again. */
export function fileProblem(file: File) {
  if (!/\.(pdf|jpe?g|png|webp|mp4|webm|m4a|txt|csv)$/i.test(file.name)) return "Choose PDF, JPEG, PNG, WebP, MP4, WebM, M4A, TXT or CSV.";
  if (file.size > chatFileLimit) return "Choose a file up to 5 MB.";
  if (!file.size) return "Choose a nonempty file.";
  return null;
}

/** Sends one file to the conversation. Reusing the same ID after a lost response does not store it twice. */
export function uploadChatFile({ familyId, channelId, id, file, token, signal, onProgress, voiceSeconds }: {
  familyId: string; channelId: string; id: string; file: File; token: string; signal: AbortSignal; onProgress: (percent: number) => void; voiceSeconds?: number;
}) {
  return new Promise<StoredFile>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const interrupted = () => reject(new Error("Upload interrupted. Try again."));
    request.open("POST", apiUploadUrl("/api/v1/families/" + familyId + "/channels/" + channelId + "/uploads"));
    request.setRequestHeader("Authorization", "Bearer " + token);
    request.responseType = "json";
    request.timeout = 60000;
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100))); };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300 && request.response?.id) resolve(request.response as StoredFile);
      else reject(new Error(typeof request.response?.message === "string" ? request.response.message : "We couldn’t upload this file. Try again."));
    };
    request.onerror = interrupted;
    request.ontimeout = interrupted;
    request.onabort = interrupted;
    if (signal.aborted) return interrupted();
    signal.addEventListener("abort", () => request.abort(), { once: true });
    const form = new FormData();
    form.set("id", id);
    if (voiceSeconds) form.set("voiceSeconds", String(voiceSeconds));
    form.set("file", file);
    request.send(form);
  });
}
