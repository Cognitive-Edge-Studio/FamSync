import { Redirect } from "expo-router";
import { Notice } from "./ui";
import { modules, shownModules } from "@/lib/modules";

const showUnbuilt = __DEV__ && process.env.EXPO_PUBLIC_SHOW_UNBUILT === "1";

/** A module's place until it is built. A link to it in a testers' build returns to Today. */
export function UnbuiltModule({ name }: { name: string }) {
  const module = modules.find((item) => item.key === name);
  if (!module || !shownModules(showUnbuilt).includes(module)) return <Redirect href="/today" />;
  return <Notice icon={module.icon} title={module.title}>{"Planned for " + module.milestone + "."}</Notice>;
}
