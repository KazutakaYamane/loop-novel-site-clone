import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchGenres, fetchMyWork } from "@/lib/api/works";
import { WorkForbidden } from "@/app/my/works/_components/WorkForbidden/WorkForbidden";
import styles from "@/app/my/works/_components/workPage.module.css";
import { WorkDetails } from "../WorkDetails/WorkDetails";

// ワークスペースの作品の画面。話の一覧は後の issue(#124)がここに足す
export async function WorkContent({ params }: Pick<PageProps<"/my/works/[id]">, "params">) {
  const { id } = await params;
  const result = await fetchMyWork(await cookies(), id);
  if (result.status === "forbidden") {
    return <WorkForbidden />;
  }
  if (result.status === "not-found") {
    notFound();
  }
  const { work } = result;
  const genres = await fetchGenres();

  return (
    <main className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="パンくずリスト">
        <Link href="/my">小説</Link>
      </nav>
      <h1 className={styles.title}>{work.title}</h1>
      <WorkDetails work={work} genres={genres} />
      <Link className={styles.edit} href={`/my/works/${work.id}/edit`}>
        小説の設定を編集
      </Link>
    </main>
  );
}
