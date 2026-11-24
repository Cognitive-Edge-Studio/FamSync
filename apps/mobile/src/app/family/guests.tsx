import { router, Stack } from "expo-router";
import { GuestAccess } from "@/components/guest-access";
import { Page, WithFamily } from "@/components/screen";
import { Notice } from "@/components/ui";

export default function FamilyGuests() { return <><Stack.Screen options={{ title: "Channel guests" }} /><WithFamily>{(family) => family.role === "owner" ? <Page><GuestAccess owner familyId={family.id} /></Page> : <Notice icon="lock-closed-outline" title="Only the owner can manage all guests" action={{ title: "Go back", onPress: () => router.back() }} />}</WithFamily></>; }
