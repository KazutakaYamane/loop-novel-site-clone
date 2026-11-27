import type { Metadata } from "next";
import { fetchPublicEpisode } from "@/lib/api/publicWorks";

export async function generateMetadata({ params }: LayoutProps<"/works/[workId]/episodes/[episodeId]">): Promise<Metadata> {
  const { workId, episodeId } = await params;
  const episode = await fetchPublicEpisode(workId, episodeId);
  if (episode === null) {
    return {};
  }
  const title = `${episode.title} - ${episode.work.title}`;
  return {
    title,
    openGraph: { title, description: episode.work.introduction || title },
  };
}

export default function EpisodeLayout({ children }: LayoutProps<"/works/[workId]/episodes/[episodeId]">) {
  return children;
}
