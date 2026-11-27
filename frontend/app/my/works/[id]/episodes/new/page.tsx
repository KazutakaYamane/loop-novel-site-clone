import type { Metadata } from "next";
import { Suspense } from "react";
import { NewEpisodeContent } from "./_components/NewEpisodeContent/NewEpisodeContent";

export const metadata: Metadata = {
  title: "エピソードを作成 | ヨミカキ",
};

// 作品は cookie を付けて Laravel から読むので、ページの中の Suspense で待つ(Cache Components の動的な部分)
export default function NewEpisodePage({ params }: PageProps<"/my/works/[id]/episodes/new">) {
  return (
    <Suspense fallback={null}>
      <NewEpisodeContent params={params} />
    </Suspense>
  );
}
