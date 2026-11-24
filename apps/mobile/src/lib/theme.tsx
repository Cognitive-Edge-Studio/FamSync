import * as SystemUI from "expo-system-ui";
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { keyStore } from "./secure-store";

// The same tokens as apps/web/src/app/globals.css.
const light = { canvas: "#f5f5f4", background: "#fafaf9", foreground: "#242424", primary: "#58725f", primaryPressed: "#526c58", onPrimary: "#ffffff", muted: "#f1f0ec", mutedForeground: "#64666c", accent: "#e9efe9", border: "#e7e7e5", destructive: "#c0392b", panel: "#ffffff", sage: "#e3efd9", onSage: "#3d5a2e", peach: "#ffefd6", onPeach: "#85520f", sky: "#e2edf7", onSky: "#2c5679", rose: "#fbe6e3", onRose: "#9a3328", lavender: "#ece8fb", onLavender: "#54469a" };
export type Colors = typeof light;
const dark: Colors = { canvas: "#141413", background: "#191918", foreground: "#ecebe6", primary: "#8fb59a", primaryPressed: "#9fc2a9", onPrimary: "#13201a", muted: "#2a2926", mutedForeground: "#a7a59d", accent: "#26302a", border: "#33322e", destructive: "#f0806f", panel: "#201f1d", sage: "#233128", onSage: "#b8d6aa", peach: "#382c1c", onPeach: "#f1c88d", sky: "#1d2a36", onSky: "#a9cbea", rose: "#3a2320", onRose: "#f2ada2", lavender: "#2b2740", onLavender: "#c9bff6" };

export const themeChoices = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof themeChoices)[number];
const key = "famsync-theme";
const Context = createContext<{ colors: Colors; dark: boolean; choice: ThemeChoice; choose: (next: ThemeChoice) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useColorScheme(), [choice, setChoice] = useState<ThemeChoice>("light");
  useEffect(() => {
    keyStore.get(key).then((saved) => { if (themeChoices.includes(saved as ThemeChoice)) setChoice(saved as ThemeChoice); }, () => {});
  }, []);
  const isDark = choice === "dark" || (choice === "system" && device === "dark"), colors = isDark ? dark : light;
  useEffect(() => { void SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => {}); }, [colors]);
  const value = useMemo(() => ({ colors, dark: isDark, choice, choose: (next: ThemeChoice) => { setChoice(next); keyStore.set(key, next).catch(() => {}); } }), [colors, isDark, choice]);
  return <Context value={value}>{children}</Context>;
}
export function useTheme() {
  const value = use(Context);
  if (!value) throw new Error("ThemeProvider is missing.");
  return value;
}
