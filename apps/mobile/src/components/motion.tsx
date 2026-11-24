import { useEffect, useState } from 'react';
import { Pressable, type PressableProps, type ViewProps } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { motion, useMotion } from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Transform only: press feedback does not shift neighboring controls or change their hit targets. */
export function MotionPressable({ style, children, onPressIn, onPressOut, onHoverIn, onHoverOut, disabled, ...props }: PressableProps) {
  const { reduced } = useMotion(), [pressed, setPressed] = useState(false), [hovered, setHovered] = useState(false), scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(pressed && !disabled && !reduced ? 0.98 : 1, { duration: reduced ? 0 : pressed ? motion.press : motion.release, easing: Easing.out(Easing.cubic), reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.Never });
    return () => cancelAnimation(scale);
  }, [pressed, disabled, reduced, scale]);
  const feedback = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <AnimatedPressable {...props} disabled={disabled} style={[typeof style === 'function' ? style({ pressed, hovered }) : style, feedback]}
    aria-checked={props['aria-checked'] ?? props.accessibilityState?.checked} aria-selected={props['aria-selected'] ?? props.accessibilityState?.selected}
    aria-busy={props['aria-busy'] ?? props.accessibilityState?.busy} aria-disabled={props['aria-disabled'] ?? disabled ?? props.accessibilityState?.disabled}
    onHoverIn={(event) => { setHovered(true); onHoverIn?.(event); }} onHoverOut={(event) => { setHovered(false); onHoverOut?.(event); }}
    onPressIn={(event) => { setPressed(true); onPressIn?.(event); }} onPressOut={(event) => { setPressed(false); onPressOut?.(event); }}>
    {typeof children === 'function' ? children({ pressed, hovered }) : children}
  </AnimatedPressable>;
}

/** No exit animation: removed or access-revoked records disappear immediately. */
export function Reveal({ delay = 0, style, ...props }: ViewProps & { delay?: number }) {
  const { reduced } = useMotion(), progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    const enter = withTiming(1, { duration: reduced ? 0 : motion.enter, easing: Easing.out(Easing.cubic), reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.Never });
    progress.value = !reduced && delay > 0 ? withDelay(Math.min(160, delay), enter, ReduceMotion.Never) : enter;
    return () => cancelAnimation(progress);
  }, [progress, reduced, delay]);
  // Animate transforms in normal layout flow; layout-animation clones can obscure web-preview form fields.
  const entrance = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 10 }] }));
  return <Animated.View {...props} style={[style, entrance]} />;
}
