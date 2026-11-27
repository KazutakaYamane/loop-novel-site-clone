import Link from "next/link";
import { fetchNewArrivals } from "@/lib/api/newArrivals";
import styles from "./NewArrivals.module.css";

// 1 ページ目はトップに出し、2 ページ目からは新着の一覧のページで出す
function newArrivalsHref(page: number): string {
  return page === 1 ? "/" : `/new-arrivals?page=${page}`;
}

export async function NewArrivals({ page: requestedPage }: { page: number }) {
  const { works, page, hasNext } = await fetchNewArrivals(requestedPage);
  const hasPrevious = page > 1;

  return (
    <section className={styles.root} aria-labelledby="new-arrivals-heading" data-testid="new-arrivals">
      <h2 id="new-arrivals-heading" className={styles.heading}>
        新着小説
      </h2>
      {works.length === 0 && (
        <p className={styles.empty}>{hasPrevious ? "このページに小説はありません。" : "公開されている小説はまだありません。"}</p>
      )}
      {works.map((work) => (
        <article key={work.id} className={styles.work} data-testid="new-arrival-work">
          <span className={styles.band} aria-hidden="true" />
          <div className={styles.body}>
            <div className={styles.info}>
              <h3 className={styles.title}>
                <Link href={`/works/${work.id}`}>{work.title}</Link>
              </h3>
              <p className={styles.author} data-testid="new-arrival-author">{work.author_name}</p>
              {work.introduction && <p className={styles.introduction}>{work.introduction}</p>}
            </div>
            {work.catchphrase && <p className={styles.catchphrase}>{work.catchphrase}</p>}
          </div>
        </article>
      ))}
      {(hasPrevious || hasNext) && (
        <nav className={styles.pager} aria-label="ページ送り">
          <div className={styles.previous}>
            {hasPrevious && <Link href={newArrivalsHref(page - 1)}>前へ</Link>}
          </div>
          <div className={styles.next}>
            {hasNext && <Link href={newArrivalsHref(page + 1)}>次へ</Link>}
          </div>
        </nav>
      )}
    </section>
  );
}
