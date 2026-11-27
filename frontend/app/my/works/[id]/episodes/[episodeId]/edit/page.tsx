import type { Metadata } from "next";
import { Suspense } from "react";
import { EditEpisodeContent } from "./_components/EditEpisodeContent/EditEpisodeContent";

export const metadata: Metadata = {
  title: "エピソードの執筆 | ヨミカキ",
};

// 話は cookie を付けて Laravel から読むので、ページの中の Suspense で待つ(Cache Components の動的な部分)
export default function EditEpisodePage({ params }: PageProps<"/my/works/[id]/episodes/[episodeId]/edit">) {
  return (
    <Suspense fallback={null}>
      <EditEpisodeContent params={params} />
    </Suspense>
  );
}
