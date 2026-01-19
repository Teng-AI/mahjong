import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mahjong Vibes",
  description: "Multiplayer Fujian Mahjong (Gold Rush Mahjong) game. Play with friends online!",
  keywords: ["mahjong", "fujian mahjong", "gold rush mahjong", "multiplayer", "card game", "tile game"],
  authors: [{ name: "Teng Zheng" }],
  creator: "Teng Zheng",
  metadataBase: new URL("https://mahjong-vibes.vercel.app"),
  openGraph: {
    title: "Mahjong Vibes",
    description: "Multiplayer Fujian Mahjong (Gold Rush Mahjong) game. Play with friends online!",
    siteName: "Mahjong Vibes",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Mahjong Vibes - Fujian Mahjong",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mahjong Vibes",
    description: "Multiplayer Fujian Mahjong (Gold Rush Mahjong) game. Play with friends online!",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mahjong Vibes",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
