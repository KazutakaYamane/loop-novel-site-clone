import { internalApiUrl } from "@/lib/api/internalApiUrl";

// Laravel の WorkResource と同じ形(docs/adr/0019)
export type Work = {
  id: number;
  title: string;
  catchphrase: string | null;
  introduction: string | null;
  genre: string | null;
  tags: string[];
  rating_cruel: boolean;
  rating_violent: boolean;
  rating_sexual: boolean;
  serial_status: "running" | "completed";
};

export type GenreOption = { value: string; label: string };

export type MyWorkResult = { status: "ok"; work: Work } | { status: "forbidden" } | { status: "not-found" };

type CookieStore = { toString(): string };

// サーバー側の描画から、ブラウザの cookie を付けて Laravel を呼ぶ(docs/adr/0015)
async function getFromLaravel(path: string, cookies?: CookieStore): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cookies !== undefined) {
    headers.Cookie = cookies.toString();
  }
  return fetch(internalApiUrl(path), { headers, cache: "no-store" });
}

function failed(path: string, response: Response): Error {
  return new Error(`GET ${path} failed with ${response.status}`);
}

export async function fetchMyWorks(cookies: CookieStore): Promise<Work[]> {
  const path = "/api/my/works";
  const response = await getFromLaravel(path, cookies);
  if (!response.ok) {
    throw failed(path, response);
  }
  const body: { data: Work[] } = await response.json();
  return body.data;
}

// 所有者でなければ Laravel が 403 を返す(docs/adr/0020)
export async function fetchMyWork(cookies: CookieStore, id: string): Promise<MyWorkResult> {
  // URL の一部をそのまま API のパスに入れると、別の API を呼べてしまう
  if (!/^\d+$/.test(id)) {
    return { status: "not-found" };
  }
  const path = `/api/my/works/${id}`;
  const response = await getFromLaravel(path, cookies);
  if (response.status === 403) {
    return { status: "forbidden" };
  }
  if (response.status === 404) {
    return { status: "not-found" };
  }
  if (!response.ok) {
    throw failed(path, response);
  }
  const work: Work = await response.json();
  return { status: "ok", work };
}

export async function fetchGenres(): Promise<GenreOption[]> {
  const path = "/api/genres";
  const response = await getFromLaravel(path);
  if (!response.ok) {
    throw failed(path, response);
  }
  const body: { data: GenreOption[] } = await response.json();
  return body.data;
}
