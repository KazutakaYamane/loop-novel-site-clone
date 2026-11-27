import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchCurrentUser, SESSION_COOKIE } from "./currentUser";

type Recorded = { url: string; init: RequestInit | undefined };

// Laravel の GET /api/user を、セッション ID → 利用者名の対応で真似る
function fakeLaravel(sessions: Record<string, string>, recorded: Recorded[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    recorded.push({ url: String(input), init });
    const cookie = new Headers(init?.headers).get("Cookie") ?? "";
    const id = /(?:^|; )yomikaki_session=([^;]*)/.exec(cookie)?.[1];
    const name = id === undefined ? undefined : sessions[id];
    if (String(input) !== "http://nginx:8080/api/user") {
      return new Response(null, { status: 404 });
    }
    if (name === undefined) {
      return Response.json({ message: "Unauthenticated." }, { status: 401 });
    }
    return Response.json({ name });
  };
}

function cookieStore(values: Record<string, string>) {
  const entries = Object.entries(values);
  return {
    has: (name: string) => name in values,
    toString: () => entries.map(([name, value]) => `${name}=${value}`).join("; "),
  };
}

describe("fetchCurrentUser", () => {
  let recorded: Recorded[];

  beforeEach(() => {
    recorded = [];
    vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
    vi.stubGlobal("fetch", fakeLaravel({ s1: "デモ読者" }, recorded));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("the session cookie name matches Laravel's", () => {
    expect(SESSION_COOKIE).toBe("yomikaki_session");
  });

  test("returns the logged-in user by forwarding the browser's cookies", async () => {
    const user = await fetchCurrentUser(cookieStore({ yomikaki_session: "s1", other: "x" }));

    expect(user).toEqual({ name: "デモ読者" });
    expect(recorded).toHaveLength(1);
    const headers = new Headers(recorded[0].init?.headers);
    expect(headers.get("Cookie")).toBe("yomikaki_session=s1; other=x");
    expect(headers.get("Accept")).toBe("application/json");
    expect(recorded[0].init?.cache).toBe("no-store");
  });

  test("a guest without a session cookie is not looked up, so no session is created", async () => {
    expect(await fetchCurrentUser(cookieStore({ other: "x" }))).toBeNull();
    expect(recorded).toHaveLength(0);
  });

  test("a session that is no longer logged in has no user", async () => {
    expect(await fetchCurrentUser(cookieStore({ yomikaki_session: "expired" }))).toBeNull();
  });

  test("an API failure is treated as not logged in", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));

    expect(await fetchCurrentUser(cookieStore({ yomikaki_session: "s1" }))).toBeNull();
  });

  test("an API failure is logged as a warning with its status, but an ended session is not", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    await fetchCurrentUser(cookieStore({ yomikaki_session: "expired" }));
    expect(stderr).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    await fetchCurrentUser(cookieStore({ yomikaki_session: "s1" }));

    expect(stderr).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(stderr.mock.calls[0][0]));
    expect(entry).toMatchObject({ level: "warn", message: "current user lookup failed", context: { status: 503 } });
    stderr.mockRestore();
  });
});
