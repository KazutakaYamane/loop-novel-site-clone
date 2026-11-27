import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>お探しのページは見つかりませんでした</h1>
      <p className={styles.description}>
        このページは現在ご覧いただけません。移動したか、削除された可能性があります。
      </p>
      <Link className={styles.homeLink} href="/">トップへ</Link>
    </main>
  );
}
