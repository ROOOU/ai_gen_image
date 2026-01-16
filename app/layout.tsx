import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Photo - AI 图片生成",
  description: "使用 ModelScope 通义万相模型生成高质量 AI 图片",
  keywords: ["AI", "图片生成", "ModelScope", "AI Photo", "通义万相"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.variable}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
