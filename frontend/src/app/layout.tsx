import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SearchPick.ai — The AI That Finds, Thinks, and Buys Smarter",
  description:
    "SearchPick.ai is a production-ready AI Commerce Operating System. It doesn't just recommend products — it thinks like an expert buyer.",
  keywords: ["AI shopping", "procurement AI", "product comparison", "SearchPick"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
