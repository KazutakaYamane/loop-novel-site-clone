import { fetchCsrfToken } from "@/lib/api/csrfToken";
import { reportExpiredDemoSession } from "@/lib/api/sessionExpired";
import type { Work } from "./works";

export type WorkSettings = Omit<Work, "id">;

// errors は Laravel の確かめのエラー(項目ごとの文言)。項目に結び付かない失敗は form に入れる
export type SaveResult = { ok: true; work: Work } | { ok: false; errors: Record<string, string[]> };

const RETRY = { form: ["保存できませんでした。時間をおいてもう一度お試しください。"] };

async function send(path: string, method: "POST" | "PUT", body: unknown): Promise<SaveResult> {
  const token = await fetchCsrfToken();
  if (token === null) {
    return { ok: false, errors: RETRY };
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify(body),
  });
  if (reportExpiredDemoSession(response)) {
    return { ok: false, errors: RETRY };
  }
  if (response.ok) {
    const work: Work = await response.json();
    return { ok: true, work };
  }
  if (response.status === 422) {
    const { errors }: { errors: Record<string, string[]> } = await response.json();
    return { ok: false, errors };
  }
  if (response.status === 403) {
    return { ok: false, errors: { form: ["この小説は編集できません。"] } };
  }
  return { ok: false, errors: RETRY };
}

export function createWork(input: { title: string; introduction: string }): Promise<SaveResult> {
  return send("/api/my/works", "POST", input);
}

export function updateWork(id: number, settings: WorkSettings): Promise<SaveResult> {
  return send(`/api/my/works/${id}`, "PUT", settings);
}
