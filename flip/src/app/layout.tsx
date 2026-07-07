import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/provider";

// Rounded, friendly typography (Duolingo-style).
const geistSans = Nunito({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Chiaro — Non ti fregano più!",
  description:
    "Fotografa o carica un documento: Chiaro te lo spiega in parole semplici e ti avvisa se c'è una fregatura.",
  applicationName: "Chiaro",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chiaro",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#e2e8f0]">
        <div className="app-shell bg-canvas shadow-[0_0_60px_-15px_rgba(15,23,42,0.25)]">
          <I18nProvider>{children}</I18nProvider>
        </div>
      </body>
    </html>
  );
}
