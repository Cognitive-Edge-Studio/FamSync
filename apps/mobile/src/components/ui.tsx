import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ComponentProps, type ComponentRef, type ReactNode, type Ref } from "react";
import { ActivityIndicator, Text as NativeText, TextInput, View, type TextInputProps, type TextProps, type ViewProps } from "react-native";
import { useTheme } from "@/lib/theme";
import { MotionPressable, Reveal } from './motion';
import { ModuleIcon } from './module-icon';
import { moduleIconFor } from '@/lib/module-icons';

export type IconName = ComponentProps<typeof Ionicons>["name"];
export function Icon(props: ComponentProps<typeof Ionicons>) {
  const artwork = moduleIconFor(props.name);
  if (artwork) return <ModuleIcon name={artwork} size={props.size ?? 24} />;
  return <Ionicons accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" {...props} />;
}

export function Text({ muted, size = 15, weight = "400", style, ...props }: TextProps & { muted?: boolean; size?: number; weight?: "400" | "500" | "600" | "700" }) {
  const { colors } = useTheme();
  return <NativeText {...props} style={[{ color: muted ? colors.mutedForeground : colors.foreground, fontSize: size, lineHeight: Math.round(size * 1.4), fontWeight: weight }, style]} />;
}

export function Card({ style, ...props }: ViewProps) {
  const { colors } = useTheme();
  return <View {...props} style={[{ backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 18, gap: 12 }, style]} />;
}

export function Button({ title, onPress, busy = false, disabled = false, variant = "primary", icon }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; variant?: "primary" | "outline" | 'tonal' | 'ghost'; icon?: IconName }) {
  const { colors } = useTheme(), primary = variant === "primary", off = busy || disabled;
  return (
    <MotionPressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 50, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", opacity: off ? 0.55 : 1,
        backgroundColor: primary ? (pressed ? colors.primaryPressed : colors.primary) : variant === 'tonal' || pressed ? colors.accent : "transparent", borderWidth: variant === 'outline' ? 1 : 0, borderColor: colors.border })}>
      {busy && <ActivityIndicator size="small" color={primary ? colors.onPrimary : colors.foreground} />}
      {!busy && icon && <Icon name={icon} size={20} color={primary ? colors.onPrimary : colors.primary} />}
      <Text weight="600" style={{ color: primary ? colors.onPrimary : variant === 'tonal' || variant === 'ghost' ? colors.primary : colors.foreground, textAlign: "center", flexShrink: 1 }}>{title}</Text>
    </MotionPressable>
  );
}

/** Visible keyboard/touch focus, shared by auth and ordinary forms. Consumer focus handlers and refs still run. */
export function Input({ style, inputRef, onFocus, onBlur, ...props }: TextInputProps & { inputRef?: Ref<ComponentRef<typeof TextInput>> }) {
  const { colors } = useTheme(), [focused, setFocused] = useState(false);
  return <TextInput {...props} ref={inputRef} placeholderTextColor={colors.mutedForeground} selectionColor={colors.primary}
    onFocus={(event) => { setFocused(true); onFocus?.(event); }} onBlur={(event) => { setFocused(false); onBlur?.(event); }}
    style={[{ minHeight: 52, borderWidth: 1.5, borderColor: focused ? colors.primary : colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.panel, opacity: props.editable === false ? 0.55 : 1 }, style]} />;
}

/** Loading, empty, error and offline states share one look. */
export function Notice({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: { title: string; onPress: () => void; busy?: boolean } }) {
  const { colors } = useTheme();
  return (
    <Reveal style={{ padding: 24, gap: 14, alignItems: "center" }} accessibilityLiveRegion="polite">
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={28} color={colors.primary} accessible={false} importantForAccessibility="no" /></View>
      <Text size={17} weight="600" style={{ textAlign: "center" }} accessibilityRole="header">{title}</Text>
      {children ? <Text muted style={{ textAlign: "center" }}>{children}</Text> : null}
      {action && <Button variant="outline" {...action} />}
    </Reveal>
  );
}

export function Loading({ label }: { label: string }) {
  const { colors } = useTheme();
  return <View style={{ padding: 32, gap: 12, alignItems: "center" }} accessible accessibilityLabel={label} accessibilityLiveRegion="polite"><ActivityIndicator size="large" color={colors.primary} /><Text muted>{label}</Text></View>;
}
