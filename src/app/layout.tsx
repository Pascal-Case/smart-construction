import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { DESIGN_THEME_BOOTSTRAP_SCRIPT } from "@/lib/design-theme";

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: DESIGN_THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
