"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, readThemePreference, saveThemePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { floatingPanel, menuItem } from "./ui/floating";

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

// Tracks the saved preference and follows the device setting live while "System" is chosen.
export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>("light");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  useEffect(() => {
    const sync = () => {
      const next = readThemePreference();
      setPreference(next);
      setResolved(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    };
    sync();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => { if (readThemePreference() === "system") { applyTheme("system", true); sync(); } };
    media.addEventListener("change", onSystem);
    window.addEventListener("famsync:theme", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", onSystem);
      window.removeEventListener("famsync:theme", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { preference, resolved };
}

// Top-bar control: the icon shows the current look; the menu offers Light, Dark and System.
export function ThemeMenu({ className }: { className?: string }) {
  const { preference, resolved } = useThemePreference();
  const Icon = resolved === "dark" ? Moon : Sun;
  const label = "Theme: " + options.find((o) => o.value === preference)!.label;
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={label} title={label}
        className={cn("inline-flex size-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-accent data-[popup-open]:bg-accent", className)}>
        <Icon aria-hidden="true" className="size-[18px]" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <Menu.Popup className={cn(floatingPanel, "min-w-44")}>
            <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Appearance</p>
            <Menu.RadioGroup value={preference} onValueChange={(value) => saveThemePreference(value as ThemePreference)}>
              {options.map(({ value, label: text, icon: OptionIcon }) => (
                <Menu.RadioItem key={value} value={value} className={menuItem} closeOnClick>
                  <OptionIcon aria-hidden="true" />{text}
                  <Menu.RadioItemIndicator className="ml-auto"><Check aria-hidden="true" /></Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
