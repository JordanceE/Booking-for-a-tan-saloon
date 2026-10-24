import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunroom — Your next glow, on your time",
  description:
    "A little sunshine, on your schedule. Book a tanning session at Sunroom Studio.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
