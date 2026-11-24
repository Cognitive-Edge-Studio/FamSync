export type FamilyIdentity = { id: string; isDefault: boolean };

// One family per person, chosen by the server. There is no list or switcher.
export function defaultFamily<T extends FamilyIdentity>(families: T[]): T | undefined {
  return families.find((family) => family.isDefault) ?? families[0];
}
