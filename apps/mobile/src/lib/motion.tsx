import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const Context = createContext(true);
export const motion = { press: 90, release: 160, enter: 220, change: 180 } as const;

/** Reanimated's initial value is synchronous; AccessibilityInfo tracks live changes. Animations use this current value, not a startup-only System snapshot. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const initial = useReducedMotion(), [reduced, setReduced] = useState(initial);
  useEffect(() => {
    let active = true, changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => { changed = true; setReduced(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active && !changed) setReduced(value); }, () => {});
    return () => { active = false; listener?.remove(); };
  }, []);
  return <Context value={reduced}>{children}</Context>;
}

export const useMotion = () => ({ reduced: use(Context) });
