import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.bottom}>
          <p className={styles.notice}>
            このサイトは、小説投稿サイトのカクヨムの非公式のクローンです。株式会社KADOKAWA・株式会社はてなとは関係ありません。
          </p>
          <small className={styles.copyright}>© ヨミカキ</small>
        </div>
      </div>
    </footer>
  );
}
