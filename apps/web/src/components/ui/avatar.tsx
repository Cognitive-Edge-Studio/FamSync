"use client";

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "@/lib/utils";

const tints = ["bg-sage text-sage-foreground", "bg-peach text-peach-foreground", "bg-lavender text-lavender-foreground", "bg-sky text-sky-foreground", "bg-rose text-rose-foreground"];

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Account IDs choose an illustrative character consistently; names do not imply a person's appearance.
export function Avatar({ name, colorKey, size = "md", className, src }: { name: string; colorKey?: string; size?: "sm" | "md" | "lg"; className?: string; src?: string | null }) {
  const key = colorKey ?? name;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const character = `person-${String(hash % 6 + 1).padStart(2, "0")}`;
  const image = src === undefined ? `/avatars/3d/${character}.webp` : src;
  return (
    <AvatarPrimitive.Root aria-hidden="true" data-avatar={character} className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-medium ring-1 ring-border/50",
      size === "sm" ? "size-6 text-[0.625rem]" : size === "lg" ? "size-11 text-sm" : "size-8 text-xs", tints[hash % tints.length], className)}>
      {image && <AvatarPrimitive.Image src={image} srcSet={src === undefined ? `/avatars/3d/${character}@2x.webp 2x` : undefined}
        alt="" width={96} height={96} draggable={false} className="size-full object-contain" />}
      <AvatarPrimitive.Fallback className="grid size-full place-items-center">{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
