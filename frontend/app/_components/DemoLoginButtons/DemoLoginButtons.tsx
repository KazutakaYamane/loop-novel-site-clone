"use client";

import { useState } from "react";
import { findWritingPath } from "@/lib/api/myEpisodes";
import { navigateTo } from "@/lib/navigation";
import { startDemo, type DemoRole } from "@/lib/auth/startDemo";
import styles from "./DemoLoginButtons.module.css";

type Props = { variant?: "page" | "header" };

type Failure = "rate-limited" | "failed";

const failureMessages: Record<Failure, string> = {
  "rate-limited": "デモを始められる回数の上限に達しました。1時間ほどおいてからもう一度お試しください。",
  failed: "デモを始められませんでした。時間をおいてもう一度お試しください。",
};

export function DemoLoginButtons({ variant = "page" }: Props) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function start(role: DemoRole) {
    setPending(true);
    setFailure(null);
    const result = await startDemo(role);
    if (result === true) {
      // デモ作者は初期の作品の下書きの執筆の画面へ、デモ読者はトップへ移動する(AC-F2-5、AC-F2-6)
      navigateTo(role === "author" ? await findWritingPath() : "/");
      return;
    }
    setPending(false);
    setFailure(result === "rate-limited" ? "rate-limited" : "failed");
  }

  return (
    <div className={`${styles.root} ${styles[variant]}`} data-testid="demo-login-buttons">
      <button type="button" className={styles.author} disabled={pending} onClick={() => start("author")}>
        デモ作者として始める
      </button>
      <button type="button" className={styles.reader} disabled={pending} onClick={() => start("reader")}>
        デモ読者として始める
      </button>
      {failure && (
        <p role="alert" className={styles.error}>
          {failureMessages[failure]}
        </p>
      )}
    </div>
  );
}
