"use client";

import { useState } from "react";
import { logOut } from "@/lib/auth/logout";
import { navigateTo } from "@/lib/navigation";
import styles from "./HeaderActions.module.css";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    setPending(true);
    setFailed(false);
    if (await logOut()) {
      navigateTo("/");
      return;
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <span className={styles.logout}>
      <button type="button" className={styles.link} disabled={pending} onClick={handleClick}>
        ログアウト
      </button>
      {failed && (
        <span role="alert" className={styles.error}>
          ログアウトできませんでした。時間をおいてもう一度お試しください。
        </span>
      )}
    </span>
  );
}
