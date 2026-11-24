import type { Goal } from "@famsync/core/goals";
import { router } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Badge } from "./screen";
import { Text } from "./ui";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { motion, useMotion } from '@/lib/motion';
import { MotionPressable } from './motion';

export function Progress({ value, label }: { value: number | null; label: string }) {
  const { colors } = useTheme(), percent = Math.max(0, Math.min(100, value ?? 0));
  const { reduced } = useMotion(), shown = useSharedValue(percent);
  useEffect(() => { shown.value = withTiming(percent, { duration: reduced ? 0 : motion.enter, reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.Never }); }, [percent, reduced, shown]);
  const progress = useAnimatedStyle(() => ({ width: `${shown.value}%` as `${number}%` }));
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={{ height: 7, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}><Animated.View style={[{ height: 7, borderRadius: 4, backgroundColor: colors.primary }, progress]} /></View>;
}

export function GoalRow({ goal, note }: { goal: Goal; note: string }) {
  const { colors } = useTheme();
  return (
    <MotionPressable accessibilityRole="button" accessibilityLabel={goal.title + ", " + note + (goal.pastTarget ? ", past target date" : "")} onPress={() => router.push({ pathname: "/goal/[id]", params: { id: goal.id } })} style={({ pressed }) => ({ minHeight: 56, gap: 8, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4, backgroundColor: pressed ? colors.accent : "transparent" })}>
      <Text weight="500">{goal.title}</Text>
      <Text muted size={13}>{note + (goal.assignee ? " · " + goal.assignee.name : "")}</Text>
      {goal.percentage !== null && <Progress value={goal.percentage} label={goal.title + " progress"} />}
      {(goal.pastTarget || goal.needsReassignment) && <View style={{ flexDirection: "row", gap: 6 }}>{goal.pastTarget && <Badge tone="rose">Past target date</Badge>}{goal.needsReassignment && <Badge tone="peach">Needs a new assignee</Badge>}</View>}
    </MotionPressable>
  );
}
