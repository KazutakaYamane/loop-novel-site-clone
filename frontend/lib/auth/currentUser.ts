import { internalApiUrl } from "@/lib/api/internalApiUrl";
import { isDemoSessionExpired } from "@/lib/api/sessionExpired";
import { logger } from "@/lib/logger";

// backend/config/session.php の既定の cookie の名前と同じにする(docs/adr/0015)
export const SESSION_COOKIE = "yomikaki_session";
const PREVIOUS_LOGIN_COOKIE = "yomikaki_previous_login";

export type CurrentUser = { name: string };

type CurrentSession = { user: CurrentUser | null; expired: boolean };

type CookieStore = { has(name: string): boolean; toString(): string };

// ブラウザから届いた cookie を付けて Laravel にログイン中の利用者を尋ねる
export async function fetchCurrentSession(cookies: CookieStore): Promise<CurrentSession> {
  // セッションの cookie が無いゲストで尋ねると、表示のたびに Laravel のセッションが DB に増える
  if (!cookies.has(SESSION_COOKIE) && !cookies.has(PREVIOUS_LOGIN_COOKIE)) {
    return { user: null, expired: false };
  }
  const response = await fetch(internalApiUrl("/api/user"), {
    headers: { Accept: "application/json", Cookie: cookies.toString() },
    cache: "no-store",
  });
  if (response.status === 401) {
    return { user: null, expired: isDemoSessionExpired(response) };
  }
  if (!response.ok) {
    logger.warn("current user lookup failed", { status: response.status });
    return { user: null, expired: false };
  }
  const body: CurrentUser = await response.json();
  return { user: { name: body.name }, expired: false };
}

export async function fetchCurrentUser(cookies: CookieStore): Promise<CurrentUser | null> {
  return (await fetchCurrentSession(cookies)).user;
}
