import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPublicEpisode } from "@/lib/api/publicWorks";
import { EpisodeBody } from "./EpisodeBody/EpisodeBody";
import styles from "../page.module.css";

export async function PublicEpisodeContent({ params }: Pick<PageProps<"/works/[workId]/episodes/[episodeId]">, "params">) {
  const { workId, episodeId } = await params;
  const episode = await fetchPublicEpisode(workId, episodeId);
  if (episode === null) {
    notFound();
  }

  const workPath = `/works/${episode.work.id}`;
  return (
    <main className={styles.main}>
      <article>
        <header className={styles.heading}>
          <Link href={workPath}>{episode.work.title}</Link>
          <h1>{episode.title}</h1>
        </header>
        <EpisodeBody body={episode.body} />
      </article>
      <nav aria-label="エピソードの移動" className={styles.navigation}>
        {episode.previous_id !== null && (
          <Link className={styles.previous} href={`${workPath}/episodes/${episode.previous_id}`}>前の話</Link>
        )}
        <Link className={styles.contents} href={workPath}>目次</Link>
        {episode.next_id !== null && (
          <Link className={styles.next} href={`${workPath}/episodes/${episode.next_id}`}>次の話</Link>
        )}
      </nav>
    </main>
  );
}
