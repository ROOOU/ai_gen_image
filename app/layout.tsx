import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nano Banana - AI 图片生成",
  description: "使用 Google AI Nano Banana Pro 模型生成高质量 AI 图片",
  keywords: ["AI", "图片生成", "Nano Banana", "Gemini", "Google AI"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
