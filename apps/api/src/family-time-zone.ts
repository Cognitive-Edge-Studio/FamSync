export function familyTimeZone(value: string) {
  // PostgreSQL also lists TZif variants that Intl and Temporal do not recognize.
  const timeZone = value.replace(/^(?:posix|right)\//, "");
  return timeZone === "Factory" ? "UTC" : timeZone;
}
