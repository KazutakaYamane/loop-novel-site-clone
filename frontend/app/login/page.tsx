import type { Metadata } from "next";
import Image from "next/image";
import { DemoLoginButtons } from "../_components/DemoLoginButtons/DemoLoginButtons";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "ログイン | ヨミカキ",
};

// 要件書 7 章: 個人情報を持たないため、メールアドレスとパスワードの入力欄は置かず、デモのボタンだけで始める
export default function LoginPage() {
  return (
    <main className={styles.main}>
      <div className={styles.inner}>
        <Image className={styles.logo} src="/images/logo.svg" alt="" width={230} height={44} priority />
        <h1 className={styles.title}>ログイン</h1>
        <p className={styles.notice}>
          {"個人情報を保持しないため、会員登録とログインを無効にしています。"}
          {"デモのボタンを押すと、新しいデモのユーザーとして始められます。"}
        </p>
        <DemoLoginButtons />
      </div>
    </main>
  );
}
