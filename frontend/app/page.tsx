import { Suspense } from "react";
import { DemoLoginButtons } from "./_components/DemoLoginButtons/DemoLoginButtons";
import { NewArrivals } from "./_components/NewArrivals/NewArrivals";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>ヨミカキ</h1>
      <DemoLoginButtons />
      <Suspense fallback={null}>
        <NewArrivals page={1} />
      </Suspense>
    </main>
  );
}
