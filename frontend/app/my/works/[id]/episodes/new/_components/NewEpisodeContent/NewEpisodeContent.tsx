import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchMyWork } from "@/lib/api/works";
import { WorkForbidden } from "@/app/my/works/_components/WorkForbidden/WorkForbidden";
import styles from "@/app/my/works/_components/workPage.module.css";
import { EpisodeForm } from "../../../_components/EpisodeForm/EpisodeForm";

// 他の利用者の作品には、執筆の画面を出さない(AC-F4-7)。保存は Laravel も拒む
export async function NewEpisodeContent({ params }: Pick<PageProps<"/my/works/[id]/episodes/new">, "params">) {
  const { id } = await params;
  const result = await fetchMyWork(await cookies(), id);
  if (result.status === "forbidden") {
    return <WorkForbidden />;
  }
  if (result.status === "not-found") {
    notFound();
  }
  const { work } = result;

  return (
    <main className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="パンくずリスト">
        <Link href="/my">小説</Link>
        <Link href={`/my/works/${work.id}`}>{work.title}</Link>
      </nav>
      <h1 className={styles.title}>エピソードを作成</h1>
      <EpisodeForm workId={work.id} />
    </main>
  );
}
