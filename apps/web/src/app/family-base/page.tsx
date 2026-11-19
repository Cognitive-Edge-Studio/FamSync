import type { Metadata } from "next";
import { FamilyBaseScreen } from "@/components/family-base-screen";

export const metadata: Metadata = { title: "Family Base" };

export default function FamilyBasePage() {
  return <FamilyBaseScreen />;
}
