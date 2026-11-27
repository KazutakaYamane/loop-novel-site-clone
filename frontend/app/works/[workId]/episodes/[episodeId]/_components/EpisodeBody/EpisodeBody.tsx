import { Notation } from "@/lib/notation/Notation";
import styles from "./EpisodeBody.module.css";

export function EpisodeBody({ body }: { body: string }) {
  return (
    <div className={styles.body} data-testid="episode-body">
      <Notation source={body} />
    </div>
  );
}
