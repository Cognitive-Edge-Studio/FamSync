import { Stack, useLocalSearchParams } from "expo-router";
import { UnbuiltModule } from "@/components/unbuilt";
import { modules } from "@/lib/modules";

export default function ModuleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <><Stack.Screen options={{ headerShown: true, title: modules.find((module) => module.key === key)?.title ?? "FamSync" }} /><UnbuiltModule name={key} /></>;
}
