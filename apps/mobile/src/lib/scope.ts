/** Saved data of guest channels is kept under this name, apart from the person's own family. */
export const guestStore = "guest";

/** The family a conversation or folder belongs to. Guests see only what they were granted there. */
export type Scope = { id: string; store: string; guest: boolean; timeZone: string };
export const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
/** Links inside a guest channel carry its family. */
export const scopeParams = (scope: Scope): { family?: string } => scope.guest ? { family: scope.id } : {};
/** Saved data about the person, not one family. */
export const accountStore = "account";
