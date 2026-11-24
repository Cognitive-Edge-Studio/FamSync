import { useState } from "react";
import { Platform } from "react-native";
import { chooseDocuments, choosePhotos, chooseVideos, takePhoto, type Picked } from "@/lib/attachments";
import { Sheet } from "./form";
import { MenuItem } from "./screen";
import { Text } from "./ui";

export function PickFiles({ title, limit, photosOnly, note, onClose, onPicked, onError }: { title: string; limit: number; photosOnly?: boolean; note: string; onClose: () => void; onPicked: (files: Picked[]) => void; onError: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function run(pick: () => Promise<Picked[]>) {
    setBusy(true);
    try { onPicked((await pick()).slice(0, limit)); } catch (problem) { onClose(); onError(problem instanceof Error ? problem.message : "We couldn’t open that."); }
  }
  return <Sheet title={title} onClose={onClose}>
    {Platform.OS !== "web" && <MenuItem icon="camera-outline" title="Take a photo" disabled={busy} onPress={() => void run(takePhoto)} />}
    <MenuItem icon="image-outline" title={limit > 1 ? "Choose photos" : "Choose a photo"} disabled={busy} onPress={() => void run(() => choosePhotos(limit))} />
    {!photosOnly && <MenuItem icon="videocam-outline" title={limit > 1 ? 'Choose videos' : 'Choose a video'} disabled={busy} onPress={() => void run(() => chooseVideos(limit))} />}
    {!photosOnly && <MenuItem icon="document-outline" title={limit > 1 ? "Choose files" : "Choose a file"} disabled={busy} onPress={() => void run(chooseDocuments)} />}
    <Text muted size={13}>{note}</Text></Sheet>;
}
