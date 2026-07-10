import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "스마트 건설안전 매출·청구 관리",
    template: "%s | 스마트 건설안전",
  },
  description: "현장별 계약, 월 매출, 메모와 거래명세표를 관리합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
