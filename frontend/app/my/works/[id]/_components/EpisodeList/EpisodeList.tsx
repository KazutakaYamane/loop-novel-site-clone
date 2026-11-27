import { cookies } from "next/headers";
import Link from "next/link";
import { fetchMyEpisodes, type EpisodeStatus } from "@/lib/api/myEpisodes";
import styles from "./EpisodeList.module.css";

const STATUS_LABELS: Record<EpisodeStatus, string> = {
  draft: "下書き",
  published: "公開中",
};

// 公開時刻は日本の時刻で出す。サーバーの時間帯に左右されないよう、時間帯を決めて書く
const publishedAtFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// ワークスペースの作品の画面の話の一覧。並びは Laravel が返す作った順のまま(AC-F4-8)。
// 作品の画面が所有者を確かめてから描くので、読めないときは何も出さない
export async function EpisodeList({ workId }: { workId: number }) {
  const result = await fetchMyEpisodes(await cookies(), workId);
  if (result.status !== "ok") {
    return null;
  }
  const { episodes } = result;

  return (
    <section className={styles.section} aria-labelledby="episodes-heading" data-testid="episode-list">
      <div className={styles.header}>
        <h2 id="episodes-heading" className={styles.heading}>
          エピソード
        </h2>
        <Link className={styles.create} href={`/my/works/${workId}/episodes/new`}>
          エピソードを作成
        </Link>
      </div>
      {episodes.length === 0 ? (
        <p className={styles.empty}>エピソードはまだありません。</p>
      ) : (
        <ol className={styles.list} aria-label="エピソード">
          {episodes.map((episode) => (
            <li key={episode.id} className={styles.item}>
              <span className={`${styles.status} ${styles[episode.status]}`}>{STATUS_LABELS[episode.status]}</span>
              <Link className={styles.title} href={`/my/works/${workId}/episodes/${episode.id}/edit`}>
                {episode.title}
              </Link>
              {episode.published_at !== null && (
                <time className={styles.date} dateTime={episode.published_at}>
                  {publishedAtFormat.format(new Date(episode.published_at))}
                </time>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
