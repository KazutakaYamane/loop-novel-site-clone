import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MyWorkList } from "./_components/MyWorkList/MyWorkList";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "ワークスペース | ヨミカキ",
};

export default function WorkspacePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>ワークスペース</h1>
      <section className={styles.works} aria-labelledby="my-works-heading" data-testid="my-works">
        <div className={styles.worksHeader}>
          <h2 id="my-works-heading" className={styles.worksTitle}>
            小説
          </h2>
          <Link className={styles.newWork} href="/my/works/new">
            新しい小説を作成
          </Link>
        </div>
        <Suspense fallback={null}>
          <MyWorkList />
        </Suspense>
      </section>
    </main>
  );
}
