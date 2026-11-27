import { parseNotation } from "./parseNotation";
import styles from "./Notation.module.css";

// サロゲートペアや異体字セレクタを分けずに、見た目の 1 文字ごとに傍点を付ける。
const characters = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function Notation({ source }: { source: string }) {
  return parseNotation(source).map((part, index) => {
    if (typeof part === "string") {
      return part;
    }
    if ("emphasis" in part) {
      return (
        <em key={index} className={styles.emphasis}>
          {Array.from(characters.segment(part.emphasis), ({ segment }, position) => (
            <span key={position} className={styles.dot}>{segment}</span>
          ))}
        </em>
      );
    }
    return <ruby key={index}>{part.base}<rt>{part.reading}</rt></ruby>;
  });
}
