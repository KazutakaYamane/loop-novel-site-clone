import type { Metadata } from "next";
import { Suspense } from "react";
import { RestartDemoNotice } from "./_components/RestartDemoNotice/RestartDemoNotice";
import { CurrentHeaderActions } from "./_components/SiteHeader/CurrentHeaderActions";
import { SiteFooter } from "./_components/SiteFooter/SiteFooter";
import { SiteHeader } from "./_components/SiteHeader/SiteHeader";
import "./globals.css";

// 要件書 5 章: 検索エンジンに載せないため、すべてのページに noindex を付ける
export const metadata: Metadata = {
  title: "ヨミカキ",
  robots: { index: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>
        <SiteHeader
          actions={
            <Suspense fallback={null}>
              <CurrentHeaderActions />
            </Suspense>
          }
        />
        <Suspense fallback={null}>
          <RestartDemoNotice />
        </Suspense>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
