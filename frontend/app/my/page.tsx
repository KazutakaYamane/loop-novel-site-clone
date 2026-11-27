import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "ワークスペース | ヨミカキ",
};

export default function WorkspacePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>ワークスペース</h1>
    </main>
  );
}
