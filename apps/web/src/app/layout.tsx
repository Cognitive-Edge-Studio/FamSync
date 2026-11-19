import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { themeScript } from "@/lib/theme";

// Geist (SIL Open Font License) is downloaded at build time and served with the static export.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: { default: "FamSync", template: "%s | FamSync" },
  description: "A shared space for your family’s schedule, tasks, and goals.",
  icons: { icon: "/famsync.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        {/* Applies the saved light or dark theme before first paint, so pages never flash the wrong colours. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
