// Shared look for menus and popovers: white panel, soft border and shadow, scaling from the trigger.
export const floatingPanel =
  "origin-[var(--transform-origin)] rounded-xl border border-border bg-panel p-1 text-foreground shadow-lg outline-none transition-[opacity,scale] duration-150 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0";

export const menuItem =
  "flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none select-none data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
