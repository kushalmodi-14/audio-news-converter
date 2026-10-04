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
  title: "Gujarati PDF to MP3 Audio Converter",
  description: "Transform your Gujarati newspapers and documents into high-quality MP3 audio instantly. 100% free, private browser-based OCR and Text-to-Speech.",
  keywords: ["Gujarati", "PDF to MP3", "OCR", "Text to Speech", "Newspaper Audio", "Gujarati News", "TTS", "Audio Converter"],
  authors: [{ name: "Kushal" }],
  openGraph: {
    title: "Gujarati PDF to MP3 Audio Converter",
    description: "Transform your Gujarati newspapers and documents into high-quality MP3 audio instantly.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
