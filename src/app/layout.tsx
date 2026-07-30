import type { Metadata } from "next";
import { Instrument_Sans, Inter } from "next/font/google";

import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap"
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Try Folloze | A live buyer experience in 60 seconds",
  description:
    "Choose an outcome, add a domain and a few signals, then watch Folloze build a tailored buyer experience.",
  icons: { icon: "/brand/folloze-symbol.png" },
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${instrumentSans.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
