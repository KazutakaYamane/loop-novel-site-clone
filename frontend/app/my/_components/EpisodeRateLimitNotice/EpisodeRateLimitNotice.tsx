import styles from "./EpisodeRateLimitNotice.module.css";

// 10 分は Laravel の制限の期間(docs/adr/0023)。カクヨムに相当する画面が無いので、文言は自分で書く
export function EpisodeRateLimitNotice() {
  return (
    <p role="alert" className={styles.notice}>
      エピソードを保存できる回数の上限に達しました。10分ほどおいてからもう一度お試しください。
    </p>
  );
}
