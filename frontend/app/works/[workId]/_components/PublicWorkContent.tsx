import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPublicWork } from "@/lib/api/publicWorks";
import { RATINGS, SERIAL_STATUS_LABELS } from "@/lib/works/labels";
import styles from "../page.module.css";

export async function PublicWorkContent({ params }: Pick<PageProps<"/works/[workId]">, "params">) {
  const { workId } = await params;
  const work = await fetchPublicWork(workId);
  if (work === null) {
    notFound();
  }

  const ratings = RATINGS.filter(({ field }) => work[field]);

  return (
    <main className={styles.main}>
      <header className={styles.heading}>
        {work.catchphrase && <p className={styles.catchphrase}>{work.catchphrase}</p>}
        <h1>{work.title}</h1>
        <p className={styles.author} data-testid="work-author">{work.author_name}</p>
      </header>

      <div className={styles.attributes}>
        <span>{SERIAL_STATUS_LABELS[work.serial_status]}</span>
        {work.genre_label && <span>{work.genre_label}</span>}
      </div>
      {work.introduction && <p className={styles.introduction}>{work.introduction}</p>}
      {work.tags.length > 0 && (
        <ul className={styles.tags} aria-label="タグ">
          {work.tags.map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
      )}
      <div className={styles.ratings}>
        {ratings.map(({ field, label }) => <span key={field}>{label}</span>)}
      </div>

      <nav className={styles.contents} aria-labelledby="contents-heading">
        <h2 id="contents-heading">目次</h2>
        <ol>
          {work.episodes.map((episode) => (
            <li key={episode.id}>
              <Link href={`/works/${work.id}/episodes/${episode.id}`}>{episode.title}</Link>
            </li>
          ))}
        </ol>
      </nav>
    </main>
  );
}
