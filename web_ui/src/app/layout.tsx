import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import ChatWidget from "@/components/chat-widget";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "4Customer - Cửa hàng Thiết bị Công nghệ chính hãng",
  description: "Cửa hàng TMĐT cung cấp Laptop, Điện thoại, Tai nghe và Phụ kiện cao cấp hàng đầu Việt Nam, tích hợp trợ lý AI hỗ trợ khách hàng thông minh 24/7.",
};

import { Suspense } from "react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground transition-colors duration-200">
        <Suspense fallback={<div className="h-16 border-b border-border bg-card/50 animate-pulse" />}>
          <Header />
        </Suspense>
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
        <ChatWidget />
      </body>
    </html>
  );
}


