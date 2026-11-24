import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { confettiPieces, type ConfettiPiece } from '@/lib/confetti';
import { useMotion } from '@/lib/motion';

const Context = createContext<() => void>(() => {});
/** Confetti after something is finished. It never blocks touches and is skipped when movement is reduced. */
export const useCelebrate = () => use(Context);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const { reduced } = useMotion(), [run, setRun] = useState(0), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const celebrate = useCallback(() => {
    if (reduced) return;
    clearTimeout(timer.current);
    setRun((value) => Math.abs(value) + 1);
    timer.current = setTimeout(() => setRun((value) => -Math.abs(value)), 2600);
  }, [reduced]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <Context value={celebrate}>{children}{run > 0 && <Confetti key={run} seed={run} />}</Context>;
}

function Confetti({ seed }: { seed: number }) {
  const { width, height } = useWindowDimensions(), pieces = useMemo(() => confettiPieces(34, seed), [seed]);
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[StyleSheet.absoluteFill, { zIndex: 9, overflow: 'hidden' }]}>{pieces.map((piece, index) => <Piece key={index} piece={piece} width={width} height={height} />)}</View>;
}
function Piece({ piece, width, height }: { piece: ConfettiPiece; width: number; height: number }) {
  const progress = useSharedValue(0);
  useEffect(() => { progress.value = withDelay(piece.delay, withTiming(1, { duration: piece.time, easing: Easing.out(Easing.quad) })); return () => cancelAnimation(progress); }, [piece, progress]);
  // Up from the bottom, then down again, drifting to one side.
  const style = useAnimatedStyle(() => {
    const t = progress.value, rise = Math.sin(Math.min(1, t * 1.15) * Math.PI) * piece.rise * height;
    return { opacity: t === 0 ? 0 : t > 0.8 ? (1 - t) * 5 : 1, transform: [{ translateX: piece.x * width + piece.drift * width * t }, { translateY: height - rise }, { rotate: piece.spin * t + 'deg' }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: piece.size, height: piece.size * piece.shape, borderRadius: piece.shape === 1 ? piece.size / 2 : 2, backgroundColor: piece.color }, style]} />;
}
