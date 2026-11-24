export const documentTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv", "text/comma-separated-values", "video/mp4", "video/webm", "audio/mp4", "audio/x-m4a", "audio/webm"];
const limit = 5 * 1048576;

/** Checks made before sending; the server checks the content again. */
export function attachmentProblem(file: { name: string; size?: number }) {
  if (!/\.(pdf|jpe?g|png|webp|mp4|webm|m4a|weba|txt|csv)$/i.test(file.name)) return "Choose PDF, JPEG, PNG, WebP, MP4, WebM, M4A, WebM audio, TXT or CSV.";
  if (file.size !== undefined && file.size > limit) return "Choose a file up to 5 MB.";
  return file.size === 0 ? "Choose a nonempty file." : null;
}

/** The phone's own date and time, in a form safe for file names. */
export function localStamp(date: Date) {
  const two = (value: number) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + two(date.getMonth() + 1) + "-" + two(date.getDate()) + " " + two(date.getHours()) + "." + two(date.getMinutes());
}
