/** Same module artwork as apps/web/src/components/ui/module-icon.tsx. Controls keep their precise UI glyphs. */
export const moduleIconNames = ['today', 'calendar', 'tasks', 'goals', 'channels', 'messages', 'families', 'folders', 'guests', 'account', 'notifications', 'home', 'schedule', 'overdue'] as const;
export type ModuleIconName = typeof moduleIconNames[number];
const icons: Record<string, ModuleIconName> = {
  'today-outline': 'today', 'calendar-outline': 'calendar', 'calendar-clear-outline': 'calendar', 'time-outline': 'schedule',
  'checkbox-outline': 'tasks', 'flag-outline': 'goals', 'chatbubbles-outline': 'messages', 'chatbubble-outline': 'messages',
  'people-outline': 'families', 'person-outline': 'account', 'person-circle-outline': 'account', 'folder-outline': 'folders',
  'folder-open-outline': 'folders', 'person-add-outline': 'guests', 'notifications-outline': 'notifications', notifications: 'notifications',
  'home-outline': 'home', home: 'home', 'git-network-outline': 'home', 'alert-circle-outline': 'overdue', leaf: 'home',
};
export const moduleIconFor = (name: string): ModuleIconName | undefined => icons[name];
