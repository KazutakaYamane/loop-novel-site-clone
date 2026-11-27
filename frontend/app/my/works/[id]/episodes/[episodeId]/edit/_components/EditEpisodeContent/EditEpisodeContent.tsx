import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchMyEpisode } from "@/lib/api/myEpisodes";
import { fetchMyWork } from "@/lib/api/works";
import { WorkForbidden } from "@/app/my/works/_components/WorkForbidden/WorkForbidden";
import styles from "@/app/my/works/_components/workPage.module.css";
import { EpisodeForm } from "../../../../_components/EpisodeForm/EpisodeForm";

// 話の執筆の画面。他の利用者の話は中身を出さない(AC-F4-7)。公開後の編集は作らない(要件書 7 章)
export async function EditEpisodeContent({ params }: Pick<PageProps<"/my/works/[id]/episodes/[episodeId]/edit">, "params">) {
  const { id, episodeId } = await params;
  const cookieStore = await cookies();
  const [workResult, episodeResult] = await Promise.all([fetchMyWork(cookieStore, id), fetchMyEpisode(cookieStore, id, episodeId)]);
  if (workResult.status === "forbidden" || episodeResult.status === "forbidden") {
    return <WorkForbidden />;
  }
  if (workResult.status === "not-found" || episodeResult.status === "not-found") {
    notFound();
  }
  const { work } = workResult;
  const { episode } = episodeResult;

  return (
    <main className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="パンくずリスト">
        <Link href="/my">小説</Link>
        <Link href={`/my/works/${work.id}`}>{work.title}</Link>
      </nav>
      <h1 className={styles.title}>{episode.title}</h1>
      {episode.status === "published" ? (
        <>
          <p className={styles.notice}>公開済みのエピソードは編集できません。</p>
          <Link className={styles.back} href={`/my/works/${work.id}`}>
            小説に戻る
          </Link>
        </>
      ) : (
        <EpisodeForm workId={work.id} episode={episode} />
      )}
    </main>
  );
}
