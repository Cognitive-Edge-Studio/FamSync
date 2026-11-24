import { Tabs } from "expo-router";
import { useEffect, type ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { Platform, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from "@/components/ui";
import { useChats } from "@/lib/chat";
import { modules, shownModules } from "@/lib/modules";
import { useNotices } from "@/lib/notices";
import { useTheme } from "@/lib/theme";
import { motion, useMotion } from '@/lib/motion';
import { ModuleIcon } from '@/components/module-icon';

export const showUnbuilt = __DEV__ && process.env.EXPO_PUBLIC_SHOW_UNBUILT === "1";

export default function TabLayout() {
  const { colors } = useTheme(), { reduced } = useMotion(), insets = useSafeAreaInsets(), { unread, guestUnread } = useChats(), more = useNotices().unread + guestUnread, shown = shownModules(showUnbuilt);
  const icon = (name: IconName) => ({ color, focused }: { color: ColorValue | null | undefined; focused: boolean; size: number }) => <TabIcon name={name} color={color} focused={focused} />;
  return (
    <Tabs screenOptions={{ animation: reduced || Platform.OS === 'web' ? 'none' : 'fade', transitionSpec: { animation: 'timing', config: { duration: reduced ? 0 : motion.change } }, headerStyle: { backgroundColor: colors.canvas }, headerTitleStyle: { fontSize: 23, fontWeight: '700' }, headerTintColor: colors.foreground, headerShadowVisible: false, sceneStyle: { backgroundColor: colors.canvas },
      tabBarStyle: { height: 66 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(8, insets.bottom), backgroundColor: colors.panel, borderTopColor: colors.border }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.mutedForeground }}>
      {modules.filter((module) => module.tab).map((module) => (
        <Tabs.Screen key={module.key} name={module.key} options={{ title: module.title, tabBarAccessibilityLabel: module.title, tabBarIcon: icon(module.icon), ...(module.key === "chats" && unread > 0 ? { tabBarBadge: unread, tabBarAccessibilityLabel: "Chats, " + unread + " with unread messages" } : {}), ...(shown.includes(module) ? {} : { href: null }) }} />
      ))}
      <Tabs.Screen name="more" options={{ title: "More", tabBarAccessibilityLabel: 'More', tabBarIcon: icon("menu-outline"), ...(more > 0 ? { tabBarBadge: more, tabBarAccessibilityLabel: "More, " + more + " unread" } : {}) }} />
    </Tabs>
  );
}

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue | null | undefined; focused: boolean }) {
  const { colors } = useTheme(), { reduced } = useMotion(), active = useSharedValue(focused ? 1 : 0);
  useEffect(() => { active.value = withTiming(focused ? 1 : 0, { duration: reduced ? 0 : motion.change, reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.Never }); }, [focused, reduced, active]);
  const indicator = useAnimatedStyle(() => ({ opacity: active.value, transform: [{ scaleX: 0.85 + active.value * 0.15 }] }));
  return <View style={{ width: 54, height: 32, alignItems: 'center', justifyContent: 'center' }}><Animated.View style={[{ position: 'absolute', width: 54, height: 30, borderRadius: 13, backgroundColor: colors.accent }, indicator]} />{name === 'menu-outline' ? <ModuleIcon name="account" size={30} /> : <Icon name={name} color={color as ComponentProps<typeof Icon>['color']} size={30} />}</View>;
}
