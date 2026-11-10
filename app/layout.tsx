import type { Metadata } from "next";
import { Instrument_Serif, Inter, Poppins } from "next/font/google";
import { SiteHeader, UnofficialBanner } from "@/components/shell";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument" });
const brand = Poppins({ subsets: ["latin"], weight: "800", variable: "--font-poppins" });

export const metadata: Metadata = {
  title: { default: "PermitGU", template: "%s | PermitGU" },
  description: "Unofficial Guam permit guide and a one-family building-permit tracker. Not a Government of Guam website.",
  icons: { icon: "/favicon-48.png", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${brand.variable}`}>
      <body className="font-sans antialiased">
        <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-paper focus:px-3 focus:py-2" href="#main">
          Skip to main content
        </a>
        <UnofficialBanner />
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-5xl px-5 pb-20">
          {children}
        </main>
      </body>
    </html>
  );
}
