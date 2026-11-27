"use client";

import { useState } from "react";
import { navigateTo } from "@/lib/navigation";
import { startDemo, type DemoRole } from "@/lib/auth/startDemo";
import styles from "./DemoLoginButtons.module.css";

type Props = { variant?: "page" | "header" };

export function DemoLoginButtons({ variant = "page" }: Props) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start(role: DemoRole) {
    setPending(true);
    setFailed(false);
    if (await startDemo(role)) {
      // デモ作者の移動先(執筆の画面)は #124 で決める。それまではどちらもトップへ移動する
      navigateTo("/");
      return;
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <div className={`${styles.root} ${styles[variant]}`} data-testid="demo-login-buttons">
      <button type="button" className={styles.author} disabled={pending} onClick={() => start("author")}>
        デモ作者として始める
      </button>
      <button type="button" className={styles.reader} disabled={pending} onClick={() => start("reader")}>
        デモ読者として始める
      </button>
      {failed && (
        <p role="alert" className={styles.error}>
          デモを始められませんでした。時間をおいてもう一度お試しください。
        </p>
      )}
    </div>
  );
}
