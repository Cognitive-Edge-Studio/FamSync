// Android's Request cannot turn form data into text, so a text-only form is written out by hand.
export function textForm(fields: Record<string, string>, boundary: string) {
  const parts = Object.entries(fields).map(([name, value]) => "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n");
  return { body: parts.join("") + "--" + boundary + "--\r\n", contentType: "multipart/form-data; boundary=" + boundary };
}
