import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
