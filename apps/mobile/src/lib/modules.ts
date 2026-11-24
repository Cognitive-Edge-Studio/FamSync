// Every module has a place in the app. A module appears to testers once it is built.
export const modules = [
  { key: "today", title: "Today", icon: "today-outline", milestone: "M0", built: true, tab: true },
  { key: "tasks", title: "Tasks", icon: "checkbox-outline", milestone: "M1", built: true, tab: true },
  { key: "calendar", title: "Calendar", icon: "calendar-outline", milestone: "M1", built: true, tab: true },
  { key: "chats", title: "Chats", icon: "chatbubbles-outline", milestone: "M2", built: true, tab: true },
  { key: "goals", title: "Goals", icon: "flag-outline", milestone: "M1", built: true, tab: false },
  { key: "files", title: "Files", icon: "folder-outline", milestone: "M3", built: true, tab: false },
  { key: "family", title: "Family", icon: "people-outline", milestone: "M3", built: true, tab: false },
  { key: "guests", title: "Guest channels", icon: "person-add-outline", milestone: "M3", built: true, tab: false },
  { key: "notifications", title: "Notifications", icon: "notifications-outline", milestone: "M3", built: true, tab: false },
  { key: "family-base", title: "Family Base", icon: "git-network-outline", milestone: "M6", built: true, tab: false },
] as const;
export type Module = (typeof modules)[number];

export const shownModules = (showUnbuilt: boolean): Module[] => modules.filter((module) => module.built || showUnbuilt);
