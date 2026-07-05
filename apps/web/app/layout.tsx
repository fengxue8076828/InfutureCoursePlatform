import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "华语云课 HuaLearn Global",
  description: "面向欧洲与全球中国用户的在线授课平台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
