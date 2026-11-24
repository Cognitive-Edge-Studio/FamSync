import { Stack, useLocalSearchParams } from "expo-router";
import { GuestAccess } from "@/components/guest-access";
import { Page, WithFamily } from "@/components/screen";

export default function ChannelGuests() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <><Stack.Screen options={{ title: "Channel guests" }} /><WithFamily>{(family) => <Page><GuestAccess key={family.id + id} familyId={family.id} channelId={id} /></Page>}</WithFamily></>;
}
