import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1>ページが見つかりません</h1>
      <Link className={styles.homeLink} href="/">トップへ戻る</Link>
    </main>
  );
}
