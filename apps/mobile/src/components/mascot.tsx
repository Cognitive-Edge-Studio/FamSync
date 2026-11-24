import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { useMotion } from '@/lib/motion';

export type MascotMood = 'wave' | 'think' | 'cheer';
// The colors of the app icon's house.
const wall = '#f6ead6', roof = '#8fb47c', roofDark = '#759a64', ink = '#3a352f', blush = '#f2b29c', chimney = '#ead9bf', glow = '#d8c4f2', frame = '#b49ad8';
const ease = Easing.inOut(Easing.quad);

/** FamSync's own character, drawn in code: a small house that waves, thinks and cheers. It stands still when movement is reduced. */
export function Mascot({ size = 180, mood = 'wave' }: { size?: number; mood?: MascotMood }) {
  const { reduced } = useMotion(), k = size / 200;
  const bob = useSharedValue(0), arm = useSharedValue(0), other = useSharedValue(0), blink = useSharedValue(1), heart = useSharedValue(0);
  useEffect(() => {
    const all = [bob, arm, other, blink, heart] as SharedValue<number>[];
    if (reduced) { bob.value = 0; arm.value = mood === 'think' ? 0 : 1; other.value = mood === 'cheer' ? 1 : 0; blink.value = 1; heart.value = 0; return; }
    bob.value = withRepeat(withSequence(withTiming(1, { duration: mood === 'cheer' ? 260 : 900, easing: ease }), withTiming(0, { duration: mood === 'cheer' ? 260 : 900, easing: ease })), -1);
    blink.value = withRepeat(withSequence(withDelay(2200, withTiming(0.1, { duration: 90 })), withTiming(1, { duration: 110 })), -1);
    const swing = (to: number, from: number, time: number) => withRepeat(withSequence(withTiming(to, { duration: time, easing: ease }), withTiming(from, { duration: time, easing: ease })), -1);
    arm.value = mood === 'think' ? swing(0.15, 0, 700) : withSequence(withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.6)) }), swing(0.72, 1, 230));
    other.value = mood === 'cheer' ? withSequence(withTiming(1, { duration: 320 }), swing(0.72, 1, 230)) : withTiming(0, { duration: 200 });
    heart.value = mood === 'think' ? 0 : withRepeat(withSequence(withDelay(500, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) })), withTiming(0, { duration: 0 })), -1);
    return () => { for (const value of all) cancelAnimation(value); };
  }, [mood, reduced, bob, arm, other, blink, heart]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 6 * k }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ rotate: -arm.value * 125 + 'deg' }] }));
  const left = useAnimatedStyle(() => ({ transform: [{ rotate: other.value * 125 + 'deg' }] }));
  const eyes = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const love = useAnimatedStyle(() => ({ opacity: heart.value === 0 ? 0 : 1 - heart.value, transform: [{ translateY: -heart.value * 34 * k }, { scale: 0.6 + heart.value * 0.6 }] }));
  const shadow = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 - bob.value * 0.06 }] }));
  const box = (left: number, top: number, width: number, height: number) => ({ position: 'absolute' as const, left: left * k, top: top * k, width: width * k, height: height * k });
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none" style={{ width: size, height: size }}>
      <Animated.View style={[box(45, 182, 110, 14), shadow]}><Svg width="100%" height="100%" viewBox="0 0 110 14"><Ellipse cx="55" cy="7" rx="52" ry="6" fill="#00000018" /></Svg></Animated.View>
      <Animated.View style={[box(0, 0, 200, 200), body]}>
        <Animated.View style={[box(124, 2, 26, 26), love]}><Svg width="100%" height="100%" viewBox="0 0 24 24"><Path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.800-8 11-8 11z" fill="#e88c7d" /></Svg></Animated.View>
        {/* The waving arms turn around the shoulder, at the middle of each square. */}
        <Animated.View style={[box(105, 72, 100, 100), right]}><Svg width="100%" height="100%" viewBox="0 0 100 100"><Path d="M50 50 Q60 66 64 82" stroke={ink} strokeWidth="6" strokeLinecap="round" fill="none" /><Circle cx="65" cy="85" r="8.5" fill={wall} stroke={ink} strokeWidth="3" /></Svg></Animated.View>
        <Animated.View style={[box(-5, 72, 100, 100), left]}><Svg width="100%" height="100%" viewBox="0 0 100 100"><Path d="M50 50 Q40 66 36 82" stroke={ink} strokeWidth="6" strokeLinecap="round" fill="none" /><Circle cx="35" cy="85" r="8.5" fill={wall} stroke={ink} strokeWidth="3" /></Svg></Animated.View>
        <Svg width={size} height={size} viewBox="0 0 200 200" style={{ position: 'absolute' }}>
          <Rect x="126" y="34" width="18" height="38" rx="4" fill={chimney} />
          <Path d="M78 176 v12 M122 176 v12" stroke={ink} strokeWidth="7" strokeLinecap="round" />
          <Rect x="44" y="84" width="112" height="96" rx="20" fill={wall} />
          <Path d="M100 26 L176 90 Q180 100 168 100 L32 100 Q20 100 24 90 Z" fill={roof} />
          <Path d="M32 100 L168 100 Q176 99 176 93 L24 93 Q24 99 32 100 Z" fill={roofDark} />
          <Circle cx="100" cy="70" r="12" fill={glow} />
          <Path d="M100 58 v24 M88 70 h24" stroke={frame} strokeWidth="2.500" />
          <Circle cx="66" cy="141" r="8" fill={blush} opacity="0.800" /><Circle cx="134" cy="141" r="8" fill={blush} opacity="0.800" />
          {mood === 'think' ? <Path d="M92 147 q8 -4 16 0" stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" />
            : <Path d="M84 141 Q100 164 116 141 Z" fill={ink} stroke={ink} strokeWidth="3" strokeLinejoin="round" />}
        </Svg>
        <Animated.View style={[box(70, 116, 60, 20), eyes]}><Svg width="100%" height="100%" viewBox="0 0 60 20"><Circle cx="10" cy="10" r="7" fill={ink} /><Circle cx="50" cy="10" r="7" fill={ink} /><Circle cx={mood === 'think' ? 11 : 12.5} cy="7" r="2.400" fill="#fff" /><Circle cx={mood === 'think' ? 51 : 52.5} cy="7" r="2.400" fill="#fff" /></Svg></Animated.View>
      </Animated.View>
    </View>
  );
}
