import { civilDate, formatDay, shiftDay, shiftMonth } from "@famsync/core/calendar-date";
import { memberName, typedTime, type Audience, type MemberIdentity } from "@famsync/core/forms";
import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Button, Icon, Input, Text } from "./ui";
import { MotionPressable, Reveal } from './motion';
import { useMotion } from '@/lib/motion';

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text weight="600">{label}</Text>
      <Input {...props} accessibilityLabel={label} accessibilityHint={hint}
        style={[{ minHeight: props.multiline ? 112 : 52, textAlignVertical: props.multiline ? "top" : "center" }, props.style]} />
      {hint && <Text muted size={13}>{hint}</Text>}
    </View>
  );
}

export function TimeField({ label, value, onChange, editable = true }: { label: string; value: string; onChange: (value: string) => void; editable?: boolean }) {
  return <Field label={label} value={value} editable={editable} placeholder="17:30" keyboardType="number-pad" maxLength={5} onChangeText={(text) => onChange(typedTime(text))} />;
}

/** A panel from the bottom of the screen. The system back button closes it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme(), insets = useSafeAreaInsets(), { reduced } = useMotion();
  return (
    <Modal transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: "#00000080" }} />
      <Reveal accessibilityViewIsModal style={{ maxHeight: "80%", width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: colors.panel, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: insets.bottom + 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 16 }}>
          <Text size={17} weight="600" accessibilityRole="header" style={{ flex: 1 }}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={24} color={colors.foreground} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 4 }}>{children}</ScrollView>
      </Reveal>
    </Modal>
  );
}

function Opener({ label, value, onPress, disabled }: { label: string; value: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text weight="600">{label}</Text>
      <MotionPressable accessibilityRole="button" accessibilityLabel={label + ", " + value} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
        style={({ pressed }) => ({ minHeight: 52, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: pressed ? colors.accent : colors.panel, opacity: disabled ? 0.6 : 1 })}>
        <Text size={16} style={{ flex: 1 }}>{value}</Text><Icon name="chevron-down" size={18} color={colors.mutedForeground} />
      </MotionPressable>
    </View>
  );
}

export type Choice<T extends string> = { value: T; label: string; group?: string };
export function Row({ title, note, selected, multiple, onPress }: { title: string; note?: string; selected: boolean; multiple?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <MotionPressable accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => ({ minHeight: 52, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: pressed || selected ? colors.accent : "transparent" })}>
      <Icon name={multiple ? (selected ? "checkbox" : "square-outline") : selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? colors.primary : colors.mutedForeground} />
      <View style={{ flex: 1 }}><Text>{title}</Text>{note && <Text muted size={13}>{note}</Text>}</View>
    </MotionPressable>
  );
}

export function Select<T extends string>({ label, value, choices, onChange, disabled, empty = "Choose" }: { label: string; value: T; choices: Choice<T>[]; onChange: (value: T) => void; disabled?: boolean; empty?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Opener label={label} value={choices.find((choice) => choice.value === value)?.label ?? empty} disabled={disabled} onPress={() => setOpen(true)} />
      {open && <Sheet title={label} onClose={() => setOpen(false)}>
        {choices.map((choice, index) => (
          <View key={choice.value || "none"}>
            {choice.group && choice.group !== choices[index - 1]?.group && <Text muted size={13} weight="600" style={{ marginTop: 12 }}>{choice.group}</Text>}
            <Row title={choice.label} selected={choice.value === value} onPress={() => { onChange(choice.value); setOpen(false); }} />
          </View>
        ))}
      </Sheet>}
    </>
  );
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "narrow", timeZone: "UTC" });
const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
export const firstOfMonth = (day: string) => day.slice(0, 8) + "01";
export const monthLabel = (first: string) => monthTitle.format(civilDate(first));
/** The Monday-first six weeks around a month, as on web. */
export function monthDays(first: string) {
  const start = shiftDay(first, -((civilDate(first).getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => shiftDay(start, index));
}

export function MonthGrid({ month, selected, today, onPick, dots, onMonth }: { month: string; selected: string; today: string; onPick: (day: string) => void; dots?: (day: string) => number; onMonth: (first: string) => void }) {
  const { colors } = useTheme(), days = monthDays(month);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => onMonth(shiftMonth(month, -1))} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name="chevron-back" size={22} color={colors.foreground} /></Pressable>
        <Text weight="600" accessibilityRole="header" accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: "center" }}>{monthLabel(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => onMonth(shiftMonth(month, 1))} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name="chevron-forward" size={22} color={colors.foreground} /></Pressable>
      </View>
      <View style={{ flexDirection: "row" }} importantForAccessibility="no-hide-descendants">{days.slice(0, 7).map((day) => <Text key={day} muted size={13} style={{ flex: 1, textAlign: "center" }}>{weekday.format(civilDate(day))}</Text>)}</View>
      {[0, 1, 2, 3, 4, 5].map((week) => (
        <View key={week} style={{ flexDirection: "row" }}>
          {days.slice(week * 7, week * 7 + 7).map((day) => {
            const chosen = day === selected, count = dots?.(day) ?? 0, outside = day.slice(0, 7) !== month.slice(0, 7);
            return (
              <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: chosen }} accessibilityLabel={formatDay(day) + (day === today ? ", today" : "") + (dots ? ", " + (count === 1 ? "1 event" : count + " events") : "")} onPress={() => onPick(day)}
                style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: day === today ? 1 : 0, borderColor: colors.primary, backgroundColor: chosen ? colors.primary : "transparent" }}>
                <Text size={15} weight={day === today ? "700" : "400"} style={{ color: chosen ? colors.onPrimary : outside ? colors.mutedForeground : colors.foreground }}>{Number(day.slice(8))}</Text>
                {dots && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: count ? (chosen ? colors.onPrimary : colors.primary) : "transparent" }} />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function DateField({ label, value, onChange, today, optional, disabled }: { label: string; value: string; onChange: (value: string) => void; today: string; optional?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [month, setMonth] = useState(firstOfMonth(value || today));
  return (
    <>
      <Opener label={label} value={value ? formatDay(value) : optional ? "None" : "Choose a date"} disabled={disabled} onPress={() => { setMonth(firstOfMonth(value || today)); setOpen(true); }} />
      {open && <Sheet title={label} onClose={() => setOpen(false)}>
        <MonthGrid month={month} selected={value} today={today} onMonth={setMonth} onPick={(day) => { onChange(day); setOpen(false); }} />
        {optional && value ? <Button variant="outline" title="Clear date" onPress={() => { onChange(""); setOpen(false); }} /> : null}
      </Sheet>}
    </>
  );
}

export function AudienceFields({ audience, selected, members, me, onAudience, onSelected, noun }: { audience: Audience; selected: string[]; members: MemberIdentity[]; me: string; onAudience: (value: Audience) => void; onSelected: (ids: string[]) => void; noun: string }) {
  const others = members.filter((member) => member.userId !== me);
  return (
    <>
      <Select label="Who can see it" value={audience} onChange={onAudience} choices={[{ value: "family", label: "Family" }, { value: "selected", label: "Selected members" }, { value: "private", label: "Only me" }]} />
      {audience === "selected" && <View style={{ gap: 2 }}>
        <Text weight="600">Selected members</Text>
        {others.length === 0 && <Text muted>{"Invite another family member to share this " + noun + "."}</Text>}
        {others.map((member) => <Row key={member.userId} multiple title={memberName(member)} selected={selected.includes(member.userId)}
          onPress={() => onSelected(selected.includes(member.userId) ? selected.filter((id) => id !== member.userId) : [...selected, member.userId])} />)}
      </View>}
    </>
  );
}

export function ErrorText({ children }: { children: string }) {
  const { colors } = useTheme();
  return children ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: colors.destructive }}>{children}</Text> : null;
}
