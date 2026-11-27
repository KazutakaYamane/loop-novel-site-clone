import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchGenres, fetchMyWork } from "@/lib/api/works";
import { WorkForbidden } from "@/app/my/works/_components/WorkForbidden/WorkForbidden";
import styles from "@/app/my/works/_components/workPage.module.css";
import { WorkSettingsForm } from "../WorkSettingsForm/WorkSettingsForm";

export async function EditWorkContent({ params }: Pick<PageProps<"/my/works/[id]/edit">, "params">) {
  const { id } = await params;
  const result = await fetchMyWork(await cookies(), id);
  if (result.status === "forbidden") {
    return <WorkForbidden />;
  }
  if (result.status === "not-found") {
    notFound();
  }
  const { work } = result;
  const genres = await fetchGenres();

  return (
    <main className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="パンくずリスト">
        <Link href="/my">小説</Link>
        <Link href={`/my/works/${work.id}`}>{work.title}</Link>
      </nav>
      <h1 className={styles.title}>編集</h1>
      <WorkSettingsForm work={work} genres={genres} />
    </main>
  );
}
