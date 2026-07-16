import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dranimo — 手绘动画",
  description: "本地优先的手绘动画工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="zh-CN" className="h-full antialiased">
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
