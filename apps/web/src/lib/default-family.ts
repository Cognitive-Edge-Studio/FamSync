type FamilyIdentity = { id: string; isDefault: boolean };

// The server chooses, so every browser and the Android app open the same family.
export function defaultFamily<T extends FamilyIdentity>(families: T[]): T | undefined {
  return families.find((family) => family.isDefault) ?? families[0];
}
