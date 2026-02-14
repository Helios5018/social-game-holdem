import type { Metadata } from "next";
import "./globals.css";
import { LanguageShell } from "@/components/i18n/language-shell";

export const metadata: Metadata = {
  title: "Hold'em Card Assets",
  description: "SVG card deck and preview for Texas Hold'em web game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <LanguageShell>{children}</LanguageShell>
      </body>
    </html>
  );
}
