import { DemoLoginButtons } from "./_components/DemoLoginButtons/DemoLoginButtons";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>ヨミカキ</h1>
      <DemoLoginButtons />
    </main>
  );
}
