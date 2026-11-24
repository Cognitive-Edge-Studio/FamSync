export const fileSize = (size: number) => size < 1024 ? size + " B" : size < 1048576 ? (size / 1024).toFixed(1) + " KB" : (size / 1048576).toFixed(1) + " MB";

/** A name that is safe to save on the phone, without folders or control characters. */
export const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").replace(/^\.+/, "_").slice(0, 120) || "file";

/** The first 20 rows after the heading and 12 columns, with quoted commas, quotes and line breaks. */
export function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const endCell = () => { if (row.length < 12) row.push(cell); cell = ""; };
  for (let i = 0; i < text.length && rows.length < 21; i += 1) {
    const char = text[i];
    if (char === "\"") { if (quoted && text[i + 1] === "\"") { cell += "\""; i += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) endCell();
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i += 1; endCell(); rows.push(row); row = []; }
    else cell += char;
  }
  if (rows.length < 21 && (cell || row.length)) { endCell(); rows.push(row); }
  return rows;
}
