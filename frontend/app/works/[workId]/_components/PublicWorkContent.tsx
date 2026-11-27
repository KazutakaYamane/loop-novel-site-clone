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
      <div className={styles.primary}>
        <header className={styles.heading}>
          <span className={styles.band} aria-hidden="true" />
          <h1>{work.title}</h1>
          <p className={styles.author} data-testid="work-author">{work.author_name}</p>
        </header>

        <div className={styles.introduction}>
          {work.catchphrase && <p className={styles.catchphrase}>{work.catchphrase}</p>}
          {work.introduction && <p className={styles.introductionText}>{work.introduction}</p>}
        </div>

        <section className={styles.details} aria-labelledby="details-heading">
          <h2 id="details-heading">詳細</h2>
          <dl>
            <div>
              <dt>執筆状況</dt>
              <dd>{SERIAL_STATUS_LABELS[work.serial_status]}</dd>
            </div>
            {work.genre_label && (
              <div>
                <dt>ジャンル</dt>
                <dd>{work.genre_label}</dd>
              </div>
            )}
            {work.tags.length > 0 && (
              <div>
                <dt>タグ</dt>
                <dd>
                  <ul className={styles.tags} aria-label="タグ">
                    {work.tags.map((tag) => <li key={tag}>{tag}</li>)}
                  </ul>
                </dd>
              </div>
            )}
            {ratings.length > 0 && (
              <div>
                <dt>セルフレイティング</dt>
                <dd className={styles.ratings}>
                  {ratings.map(({ field, label }) => <span key={field}>{label}</span>)}
                </dd>
              </div>
            )}
          </dl>
        </section>
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
