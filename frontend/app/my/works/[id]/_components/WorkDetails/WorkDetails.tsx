import type { GenreOption, Work } from "@/lib/api/works";
import { RATINGS, SERIAL_STATUS_LABELS } from "@/lib/works/labels";
import styles from "./WorkDetails.module.css";

const NOT_SET = "未設定";

export function WorkDetails({ work, genres }: { work: Work; genres: GenreOption[] }) {
  const genre = genres.find((option) => option.value === work.genre)?.label;
  const ratings = RATINGS.filter(({ field }) => work[field]);

  return (
    <dl className={styles.details} data-testid="work-details">
      <dt>連載状態</dt>
      <dd>{SERIAL_STATUS_LABELS[work.serial_status]}</dd>
      <dt>ジャンル</dt>
      <dd>{genre ?? NOT_SET}</dd>
      <dt>キャッチコピー</dt>
      <dd>{work.catchphrase ?? NOT_SET}</dd>
      <dt>紹介文</dt>
      <dd className={styles.introduction}>{work.introduction ?? NOT_SET}</dd>
      <dt>セルフレイティング</dt>
      <dd>
        {ratings.length === 0 ? (
          NOT_SET
        ) : (
          <ul className={styles.chips}>
            {ratings.map(({ field, label }) => (
              <li key={field} className={styles.chip}>
                {label}
              </li>
            ))}
          </ul>
        )}
      </dd>
      <dt>タグ</dt>
      <dd>
        {work.tags.length === 0 ? (
          NOT_SET
        ) : (
          <ul className={styles.chips}>
            {work.tags.map((tag) => (
              <li key={tag} className={styles.chip}>
                {tag}
              </li>
            ))}
          </ul>
        )}
      </dd>
    </dl>
  );
}
