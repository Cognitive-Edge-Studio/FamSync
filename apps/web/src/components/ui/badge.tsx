import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Soft tinted badges: 20 px, 12 px medium text. Pair tone with a visible word, never colour alone.
const badgeVariants = cva("inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-4 font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-muted text-foreground/80",
      outline: "border border-border bg-panel text-foreground/80",
      sage: "bg-sage text-sage-foreground",
      peach: "bg-peach text-peach-foreground",
      lavender: "bg-lavender text-lavender-foreground",
      sky: "bg-sky text-sky-foreground",
      rose: "bg-rose text-rose-foreground",
      solid: "bg-primary text-primary-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}
