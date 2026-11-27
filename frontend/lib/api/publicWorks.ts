import { internalApiUrl } from "./internalApiUrl";
import type { Work } from "./works";

export type PublicWork = Work & {
  genre_label: string | null;
  author_name: string;
  episodes: { id: number; title: string }[];
};

export type PublicEpisode = {
  id: number;
  title: string;
  body: string;
  work: Pick<Work, "id" | "title" | "introduction">;
  previous_id: number | null;
  next_id: number | null;
};

async function fetchPublic<T>(path: string): Promise<T | null> {
  const response = await fetch(internalApiUrl(path), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  const body: { data: T } = await response.json();
  return body.data;
}

const routeId = /^\d+$/;

export async function fetchPublicWork(workId: string): Promise<PublicWork | null> {
  if (!routeId.test(workId)) {
    return null;
  }
  return fetchPublic(`/api/works/${workId}`);
}

export async function fetchPublicEpisode(workId: string, episodeId: string): Promise<PublicEpisode | null> {
  if (!routeId.test(workId) || !routeId.test(episodeId)) {
    return null;
  }
  return fetchPublic(`/api/works/${workId}/episodes/${episodeId}`);
}
