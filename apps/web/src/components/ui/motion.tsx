"use client";

import { motion, MotionConfig, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

// Shared motion settings. Durations stay short and easing soft; people who prefer reduced motion get instant changes.
export const ease = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease }}>{children}</MotionConfig>;
}

// Fades and lifts content slightly when it first appears. `index` staggers siblings.
export function FadeIn({ index = 0, children, ...props }: HTMLMotionProps<"div"> & { index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease, delay: Math.min(index, 8) * 0.04 }} {...props}>
      {children}
    </motion.div>
  );
}

// List item that fades in, eases to its new position, and fades out when removed (use inside AnimatePresence).
export const listItemMotion = {
  layout: "position" as const,
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};
