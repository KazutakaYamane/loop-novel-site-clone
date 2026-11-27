import { fetchCsrfToken } from "@/lib/api/csrfToken";
import { isEpisodeRateLimited } from "./episodeRateLimit";
import type { Episode } from "./myEpisodes";

export type EpisodeInput = { title: string; body: string };

// errors は Laravel の確かめのエラー(項目ごとの文言)。項目に結び付かない失敗は form に入れる。
// rateLimited は送信回数の上限に当たったこと(AC-F4-9)
export type EpisodeSaveResult =
  | { ok: true; episode: Episode }
  | { ok: false; errors: Record<string, string[]>; rateLimited?: true };

const RETRY = { form: ["保存できませんでした。時間をおいてもう一度お試しください。"] };

const refusals: Partial<Record<number, Record<string, string[]>>> = {
  403: { form: ["このエピソードは編集できません。"] },
  // 公開後の編集は作らない(要件書 7 章)
  409: { form: ["公開済みのエピソードは編集できません。"] },
};

async function send(path: string, method: "POST" | "PUT", input: EpisodeInput): Promise<EpisodeSaveResult> {
  const token = await fetchCsrfToken();
  if (token === null) {
    return { ok: false, errors: RETRY };
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify(input),
  });
  if (response.ok) {
    const episode: Episode = await response.json();
    return { ok: true, episode };
  }
  if (response.status === 422) {
    const { errors }: { errors: Record<string, string[]> } = await response.json();
    return { ok: false, errors };
  }
  if (isEpisodeRateLimited(response)) {
    return { ok: false, errors: {}, rateLimited: true };
  }
  return { ok: false, errors: refusals[response.status] ?? RETRY };
}

export function createEpisode(workId: number, input: EpisodeInput): Promise<EpisodeSaveResult> {
  return send(`/api/my/works/${workId}/episodes`, "POST", input);
}

export function saveEpisode(workId: number, episodeId: number, input: EpisodeInput): Promise<EpisodeSaveResult> {
  return send(`/api/my/works/${workId}/episodes/${episodeId}`, "PUT", input);
}

// 公開はフォームの内容を保存してから公開する。本文が空なら Laravel が 422 で拒む(AC-F4-6)
export function publishEpisode(workId: number, episodeId: number, input: EpisodeInput): Promise<EpisodeSaveResult> {
  return send(`/api/my/works/${workId}/episodes/${episodeId}/publication`, "POST", input);
}
