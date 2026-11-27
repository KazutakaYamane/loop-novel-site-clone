import Link from "next/link";
import styles from "../workPage.module.css";

// 他の利用者の作品は、中身を出さずに編集できないことだけを伝える(AC-F3-4、docs/adr/0020)
export function WorkForbidden() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>この小説は編集できません。</h1>
      <p className={styles.notice}>小説を編集できるのは、その小説を作った利用者だけです。</p>
      <Link className={styles.back} href="/my">
        ワークスペースに戻る
      </Link>
    </main>
  );
}
