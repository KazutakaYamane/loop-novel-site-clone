import { internalApiUrl } from "@/lib/api/internalApiUrl";

export type EpisodeStatus = "draft" | "published";

// Laravel の EpisodeSummaryResource と同じ形。一覧には本文を入れない
export type EpisodeSummary = {
  id: number;
  title: string;
  status: EpisodeStatus;
  published_at: string | null;
};

// Laravel の EpisodeResource と同じ形
export type Episode = EpisodeSummary & { work_id: number; body: string };

export type MyEpisodesResult = { status: "ok"; episodes: EpisodeSummary[] } | { status: "forbidden" } | { status: "not-found" };

export type MyEpisodeResult = { status: "ok"; episode: Episode } | { status: "forbidden" } | { status: "not-found" };

type CookieStore = { toString(): string };

// サーバー側の描画から、ブラウザの cookie を付けて Laravel を読む。所有者でなければ 403(docs/adr/0020)
async function readAsOwner<T>(path: string, cookies: CookieStore): Promise<{ status: "ok"; body: T } | { status: "forbidden" } | { status: "not-found" }> {
  const response = await fetch(internalApiUrl(path), {
    headers: { Accept: "application/json", Cookie: cookies.toString() },
    cache: "no-store",
  });
  if (response.status === 403) {
    return { status: "forbidden" };
  }
  if (response.status === 404) {
    return { status: "not-found" };
  }
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  return { status: "ok", body: await response.json() };
}

export async function fetchMyEpisodes(cookies: CookieStore, workId: number): Promise<MyEpisodesResult> {
  const result = await readAsOwner<{ data: EpisodeSummary[] }>(`/api/my/works/${workId}/episodes`, cookies);
  return result.status === "ok" ? { status: "ok", episodes: result.body.data } : result;
}

export async function fetchMyEpisode(cookies: CookieStore, workId: string, episodeId: string): Promise<MyEpisodeResult> {
  // URL の一部をそのまま API のパスに入れると、別の API を呼べてしまう
  if (!/^\d+$/.test(workId) || !/^\d+$/.test(episodeId)) {
    return { status: "not-found" };
  }
  const result = await readAsOwner<Episode>(`/api/my/works/${workId}/episodes/${episodeId}`, cookies);
  return result.status === "ok" ? { status: "ok", episode: result.body } : result;
}

async function readFromBrowser<T>(path: string): Promise<T | null> {
  const response = await fetch(path, { headers: { Accept: "application/json" }, credentials: "same-origin" });
  return response.ok ? response.json() : null;
}

// ブラウザから呼ぶ。最後に更新した作品の、最後の下書きの執筆の画面(AC-F2-5)。
// 下書きが無ければその作品の画面、作品が無いか読めなければワークスペースを開く
export async function findWritingPath(): Promise<string> {
  const works = await readFromBrowser<{ data: { id: number }[] }>("/api/my/works");
  const work = works?.data[0];
  if (work === undefined) {
    return "/my";
  }
  const episodes = await readFromBrowser<{ data: EpisodeSummary[] }>(`/api/my/works/${work.id}/episodes`);
  const draft = episodes?.data.findLast((episode) => episode.status === "draft");
  return draft === undefined ? `/my/works/${work.id}` : `/my/works/${work.id}/episodes/${draft.id}/edit`;
}
