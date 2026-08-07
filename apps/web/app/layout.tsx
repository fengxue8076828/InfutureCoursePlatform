import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INFUTURE",
  description: "INFUTURE 英启教育在线学习平台",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

