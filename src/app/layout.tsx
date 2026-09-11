import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { JournalUploadProvider } from "@/features/journal/JournalUploadProvider";
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
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <JournalUploadProvider>{children}</JournalUploadProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
