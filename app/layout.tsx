import type { Metadata, Viewport } from "next";
import { Hind, IBM_Plex_Mono, Yatra_One } from "next/font/google";
import "./globals.css";

const display = Yatra_One({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-yatra", display: "swap" });
const body = Hind({ weight: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"], variable: "--font-hind", display: "swap" });
const mono = IBM_Plex_Mono({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Committee Draw",
  description: "Our monthly committee draw: everyone contributes, one member takes the pot each month.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF3F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1B1D" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
