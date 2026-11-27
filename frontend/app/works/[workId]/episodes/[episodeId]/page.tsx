import { Suspense } from "react";
import { PublicEpisodeContent } from "./_components/PublicEpisodeContent";

export default function EpisodePage({ params }: PageProps<"/works/[workId]/episodes/[episodeId]">) {
  return (
    <Suspense fallback={null}>
      <PublicEpisodeContent params={params} />
    </Suspense>
  );
}
