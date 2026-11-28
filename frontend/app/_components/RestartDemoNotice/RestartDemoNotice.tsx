import { cookies } from "next/headers";
import { fetchCurrentSession } from "@/lib/auth/currentUser";
import { LayoutLink } from "../LayoutLink/LayoutLink";
import { WatchDemoSession } from "./WatchDemoSession";
import styles from "./RestartDemoNotice.module.css";

export async function RestartDemoNotice() {
  const { expired } = await fetchCurrentSession(await cookies());

  return (
    <>
      <WatchDemoSession />
      {expired && (
        <section className={styles.notice} aria-labelledby="restart-demo-heading">
          <h2 id="restart-demo-heading">ログイン状態が解除されました</h2>
          <p>ヨミカキを使うには、新しいデモを始めてください。</p>
          <LayoutLink href="/login" className={styles.action}>デモを始め直す</LayoutLink>
        </section>
      )}
    </>
  );
}
