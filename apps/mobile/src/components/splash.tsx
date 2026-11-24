import { SplashScreen } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotion } from '@/lib/motion';
import { useTheme } from '@/lib/theme';
import { Mascot } from './mascot';
import { Text } from './ui';

const shown = 2000;

/** A short hello on a cold start. The app loads underneath, so it never makes anyone wait for data; a tap skips it. */
export function Splash({ children }: { children: ReactNode }) {
  const { colors } = useTheme(), { reduced } = useMotion(), [done, setDone] = useState(false), leaving = useRef(false);
  const cover = useSharedValue(1), pop = useSharedValue(reduced ? 1 : 0.6), words = useSharedValue(reduced ? 1 : 0);
  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    const finish = () => setDone(true);
    cover.value = withTiming(0, { duration: reduced ? 0 : 320, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never }, () => { scheduleOnRN(finish); });
  }, [cover, reduced]);
  useEffect(() => {
    if (!reduced) { pop.value = withSpring(1, { damping: 11, stiffness: 140 }); words.value = withDelay(350, withTiming(1, { duration: 380 })); }
    const timer = setTimeout(leave, reduced ? 700 : shown);
    // The cover goes even if an animation never reports its end.
    const last = setTimeout(() => setDone(true), shown + 1200);
    return () => { clearTimeout(timer); clearTimeout(last); };
  }, [leave, pop, reduced, words]);
  const page = useAnimatedStyle(() => ({ opacity: cover.value })), character = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const greeting = useAnimatedStyle(() => ({ opacity: words.value, transform: [{ translateY: (1 - words.value) * 12 }] }));
  return (
    <>
      {children}
      {!done && <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 10 }, page]} onLayout={() => void SplashScreen.hideAsync()}>
        <Pressable accessibilityRole="button" accessibilityLabel="FamSync. Continue" onPress={leave} style={{ flex: 1, gap: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
          <Animated.View style={character}><Mascot size={210} /></Animated.View>
          <Animated.View style={[{ alignItems: 'center', gap: 4 }, greeting]}><Text size={32} weight="700">FamSync</Text><Text muted size={16}>Hello! Good to see you.</Text></Animated.View>
        </Pressable>
      </Animated.View>}
    </>
  );
}
