// Task rules are shared with the Android app; only web links live here.
export * from "@famsync/core/tasks";

export function tasksPath(familyId: string) {
  return "/tasks/?" + new URLSearchParams({ family: familyId }).toString();
}

export function taskPath(familyId: string, taskId: string) {
  return "/task/?" + new URLSearchParams({ family: familyId, id: taskId }).toString();
}
