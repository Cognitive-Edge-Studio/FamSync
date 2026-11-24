import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

export default function Index() {
  const { state } = useSession();
  return <Redirect href={state.status === "signedIn" ? "/today" : "/sign-in"} />;
}
