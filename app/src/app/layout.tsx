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
  title: "Mahjong Vibes — Play Fuzhou Mahjong Online with Friends",
  description: "福州麻将 — Play Fuzhou Mahjong online for free. Gold tile wildcards make every game exciting. Real-time multiplayer with friends — no download required.",
  keywords: ["mahjong", "fuzhou mahjong", "福州麻将", "fujian mahjong", "multiplayer", "tile game"],
  authors: [{ name: "Teng Zheng" }],
  creator: "Teng Zheng",
  metadataBase: new URL("https://mahjong-vibes.vercel.app"),
  openGraph: {
    title: "Mahjong Vibes — Play Fuzhou Mahjong Online with Friends",
    description: "福州麻将 — Play Fuzhou Mahjong online for free. Gold tile wildcards make every game exciting. Real-time multiplayer with friends — no download required.",
    siteName: "Mahjong Vibes",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Mahjong Vibes - 福州麻将 Fuzhou Mahjong",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mahjong Vibes — Play Fuzhou Mahjong Online with Friends",
    description: "福州麻将 — Play Fuzhou Mahjong online for free. Gold tile wildcards make every game exciting. Real-time multiplayer with friends — no download required.",
    images: ["/og-image.jpg"],
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
