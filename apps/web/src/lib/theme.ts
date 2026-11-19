// Light, dark or system appearance. Light is the default: nothing saved means light, whatever the device setting.
// The choice is a per-device preference kept in localStorage; the resolved theme is written to <html data-theme>
// so CSS tokens switch. layout.tsx runs themeScript before first paint.
export type ThemePreference = "light" | "dark" | "system";
export const themeKey = "famsync-theme";

export const themeScript = `(function(){try{var p=localStorage.getItem("${themeKey}");var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(themeKey);
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference, animate = false) {
  const root = document.documentElement;
  if (animate) root.setAttribute("data-theme-switching", "");
  root.dataset.theme = resolveTheme(preference);
  if (animate) window.setTimeout(() => root.removeAttribute("data-theme-switching"), 300);
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    if (preference === "light") localStorage.removeItem(themeKey);
    else localStorage.setItem(themeKey, preference);
  } catch {
    // The choice still applies until the page is closed.
  }
  applyTheme(preference, true);
  window.dispatchEvent(new CustomEvent("famsync:theme", { detail: preference }));
}
