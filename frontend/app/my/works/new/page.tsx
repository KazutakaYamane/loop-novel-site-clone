import type { Metadata } from "next";
import Link from "next/link";
import { NewWorkForm } from "./_components/NewWorkForm/NewWorkForm";
import styles from "../_components/workPage.module.css";

export const metadata: Metadata = {
  title: "新しい小説を作成 | ヨミカキ",
};

export default function NewWorkPage() {
  return (
    <main className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="パンくずリスト">
        <Link href="/my">小説</Link>
      </nav>
      <h1 className={styles.title}>新しい小説を作成</h1>
      <NewWorkForm />
    </main>
  );
}
