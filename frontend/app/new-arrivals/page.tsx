import type { Metadata } from "next";
import { Suspense } from "react";
import { RequestedNewArrivals } from "./_components/RequestedNewArrivals";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "新着小説 | ヨミカキ",
};

// 新着の 1 ページ目はトップに出す。ここは「次へ」から開く 2 ページ目以降(docs/adr/0026)
export default function NewArrivalsPage({ searchParams }: PageProps<"/new-arrivals">) {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>新着小説の一覧</h1>
      <Suspense fallback={null}>
        <RequestedNewArrivals searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
