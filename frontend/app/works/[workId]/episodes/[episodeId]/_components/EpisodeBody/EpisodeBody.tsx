import { parseNotation } from "@/lib/notation/parseNotation";
import styles from "./EpisodeBody.module.css";

export function EpisodeBody({ body }: { body: string }) {
  return (
    <div className={styles.body} data-testid="episode-body">
      {parseNotation(body).map((part, index) => typeof part === "string" ? part : (
        <ruby key={index}>{part.base}<rt>{part.reading}</rt></ruby>
      ))}
    </div>
  );
}
