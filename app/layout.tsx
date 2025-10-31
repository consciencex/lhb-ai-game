import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "DX Game : สร้างรูปด้วยกันด้วย AI",
  description:
    "Collaborative AI image generation game powered by Google Gemini. Four teams, one masterpiece!",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${poppins.className} bg-night-900 text-gray-100`}>{children}</body>
    </html>
  );
}

