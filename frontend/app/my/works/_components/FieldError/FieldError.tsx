import styles from "./FieldError.module.css";

// 入力欄の aria-describedby から読まれる、項目ごとのエラーの文言
export function FieldError({ id, messages }: { id: string; messages: string[] | undefined }) {
  if (messages === undefined) {
    return null;
  }
  return (
    <p id={id} className={styles.error}>
      {messages.join(" ")}
    </p>
  );
}

// 項目に結び付かない失敗(権限が無い、通信の失敗)
export function FormError({ messages }: { messages: string[] | undefined }) {
  if (messages === undefined) {
    return null;
  }
  return (
    <p role="alert" className={styles.error}>
      {messages.join(" ")}
    </p>
  );
}
