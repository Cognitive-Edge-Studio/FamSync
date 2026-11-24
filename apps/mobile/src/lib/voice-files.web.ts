export const recordingSize = async (uri: string) => (await (await fetch(uri)).blob()).size;
export function discardRecording(uri: string | null | undefined) { if (uri?.startsWith('blob:')) URL.revokeObjectURL(uri); }
export function clearVoiceFiles() {}
