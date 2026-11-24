import { Linking } from "react-native";

export function clearShared() {}
export async function shareFile(url: string, _name: string, _mime: string) { await Linking.openURL(url); }
