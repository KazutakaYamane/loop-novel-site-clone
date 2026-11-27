import { cookies } from "next/headers";
import Link from "next/link";
import { fetchMyWorks } from "@/lib/api/works";
import { SERIAL_STATUS_LABELS } from "@/lib/works/labels";
import styles from "./MyWorkList.module.css";

// ログイン中の利用者の作品だけを Laravel が返す(docs/adr/0020)
export async function MyWorkList() {
  const works = await fetchMyWorks(await cookies());
  if (works.length === 0) {
    return <p className={styles.empty}>まだ小説がありません。</p>;
  }
  return (
    <ul className={styles.list}>
      {works.map((work) => (
        <li key={work.id} className={styles.item}>
          <span className={styles.status}>{SERIAL_STATUS_LABELS[work.serial_status]}</span>
          <Link className={styles.title} href={`/my/works/${work.id}`}>
            {work.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}
