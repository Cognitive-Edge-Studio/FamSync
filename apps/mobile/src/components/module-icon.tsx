import { Image } from 'expo-image';
import { View } from 'react-native';
import type { ModuleIconName } from '@/lib/module-icons';

// Metro needs explicit static assets; it also bundles the matching @2x artwork for dense screens.
const assets = {
  today: require('../../assets/icons/3d/today.webp'), calendar: require('../../assets/icons/3d/calendar.webp'),
  tasks: require('../../assets/icons/3d/tasks.webp'), goals: require('../../assets/icons/3d/goals.webp'),
  channels: require('../../assets/icons/3d/channels.webp'), messages: require('../../assets/icons/3d/messages.webp'),
  families: require('../../assets/icons/3d/families.webp'), folders: require('../../assets/icons/3d/folders.webp'),
  guests: require('../../assets/icons/3d/guests.webp'), account: require('../../assets/icons/3d/account.webp'),
  notifications: require('../../assets/icons/3d/notifications.webp'), home: require('../../assets/icons/3d/home.webp'),
  schedule: require('../../assets/icons/3d/schedule.webp'), overdue: require('../../assets/icons/3d/overdue.webp'),
  helper: require('../../assets/icons/3d/helper.webp'),
} satisfies Record<ModuleIconName, number>;

/** Bundled, untinted decorative artwork. The surrounding control supplies its accessible label. */
export function ModuleIcon({ name, size = 28 }: { name: ModuleIconName; size?: number }) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, flexShrink: 0 }}>
    <Image source={assets[name]} contentFit="contain" transition={0} accessible={false} style={{ width: size, height: size }} />
  </View>;
}
