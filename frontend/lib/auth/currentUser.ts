import { internalApiUrl } from "@/lib/api/internalApiUrl";
import { logger } from "@/lib/logger";

// backend/config/session.php の既定の cookie の名前と同じにする(docs/adr/0015)
export const SESSION_COOKIE = "yomikaki_session";

export type CurrentUser = { name: string };

type CookieStore = { has(name: string): boolean; toString(): string };

// ブラウザから届いた cookie を付けて Laravel にログイン中の利用者を尋ねる
export async function fetchCurrentUser(cookies: CookieStore): Promise<CurrentUser | null> {
  // セッションの cookie が無いゲストで尋ねると、表示のたびに Laravel のセッションが DB に増える
  if (!cookies.has(SESSION_COOKIE)) {
    return null;
  }
  const response = await fetch(internalApiUrl("/api/user"), {
    headers: { Accept: "application/json", Cookie: cookies.toString() },
    cache: "no-store",
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    logger.warn("current user lookup failed", { status: response.status });
    return null;
  }
  const body: CurrentUser = await response.json();
  return { name: body.name };
}
