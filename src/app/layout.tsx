import type { Metadata } from "next";
import { Instrument_Sans, Inter } from "next/font/google";
import Script from "next/script";

import { config } from "@/lib/config";

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
  title: "Try Folloze | Build a personalized campaign page",
  description:
    "Folloze is built to be open. Bring your own AI, use Folloze Campaign Agent, or connect a custom workflow to create finished, on-brand campaign pages.",
  icons: { icon: "/brand/folloze-symbol.png" },
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const munchkinId = config.marketoMunchkinId;
  return (
    <html lang="en">
      <body className={`${instrumentSans.variable} ${inter.variable}`}>
        {children}
        {munchkinId && (
          <Script id="marketo-munchkin" strategy="afterInteractive">
            {`(function(id){var s=document.createElement('script');s.async=true;s.src='https://munchkin.marketo.net/munchkin.js';s.onload=function(){if(window.Munchkin)window.Munchkin.init(id)};document.head.appendChild(s)})(${JSON.stringify(munchkinId)});`}
          </Script>
        )}
      </body>
    </html>
  );
}
