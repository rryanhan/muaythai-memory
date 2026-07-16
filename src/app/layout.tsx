import type { Metadata } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import "@fontsource/dseg7/classic-400.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { contextBadgeUrls } from "@/components/shared/context-badges";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muay Thai Memory",
  description: "A training memory system for fighters.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  for (const href of contextBadgeUrls) {
    preload(href, { as: "image", type: "image/svg+xml" });
  }

  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
