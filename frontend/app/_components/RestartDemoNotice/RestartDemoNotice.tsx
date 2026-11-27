import { cookies } from "next/headers";
import Link from "next/link";
import { fetchCurrentSession } from "@/lib/auth/currentUser";
import { WatchDemoSession } from "./WatchDemoSession";
import styles from "./RestartDemoNotice.module.css";

export async function RestartDemoNotice() {
  const { user, expired } = await fetchCurrentSession(await cookies());
  if (!expired) {
    return user && <WatchDemoSession />;
  }

  return (
    <section className={styles.notice} aria-labelledby="restart-demo-heading">
      <h2 id="restart-demo-heading">ログイン状態が解除されました</h2>
      <p>ヨミカキを使うには、新しいデモを始めてください。</p>
      <Link href="/login" className={styles.action}>デモを始め直す</Link>
    </section>
  );
}
