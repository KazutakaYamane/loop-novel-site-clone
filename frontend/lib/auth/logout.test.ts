import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { logOut } from "./logout";

type Recorded = { url: string; init: RequestInit | undefined };

// Laravel の CSRF トークンとログアウトの API を、1 つのログイン中のセッションで真似る
function fakeLaravel(recorded: Recorded[], options: { tokenStatus?: number; logoutStatus?: number } = {}) {
  const token = "session-token";
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    recorded.push({ url: String(input), init });
    if (String(input) === "/api/csrf-token" && (init?.method ?? "GET") === "GET") {
      return Response.json({ token }, { status: options.tokenStatus ?? 200 });
    }
    if (String(input) === "/api/session" && init?.method === "DELETE") {
      if (new Headers(init.headers).get("X-CSRF-TOKEN") !== token) {
        return Response.json({ message: "CSRF token mismatch." }, { status: 419 });
      }
      return new Response(null, { status: options.logoutStatus ?? 204 });
    }
    return new Response(null, { status: 404 });
  };
}

describe("logOut", () => {
  let recorded: Recorded[];

  beforeEach(() => {
    recorded = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("@AC-F1-1 ends the session with the session's CSRF token from the same origin", async () => {
    vi.stubGlobal("fetch", fakeLaravel(recorded));

    expect(await logOut()).toBe(true);

    expect(recorded.map((r) => r.url)).toEqual(["/api/csrf-token", "/api/session"]);
    const request = recorded[1].init;
    expect(request?.method).toBe("DELETE");
    expect(request?.credentials).toBe("same-origin");
    expect(new Headers(request?.headers).get("Accept")).toBe("application/json");
  });

  test("fails without sending the logout when the token cannot be read", async () => {
    vi.stubGlobal("fetch", fakeLaravel(recorded, { tokenStatus: 500 }));

    expect(await logOut()).toBe(false);
    expect(recorded.map((r) => r.url)).toEqual(["/api/csrf-token"]);
  });

  test("fails when Laravel rejects the logout", async () => {
    vi.stubGlobal("fetch", fakeLaravel(recorded, { logoutStatus: 500 }));

    expect(await logOut()).toBe(false);
  });
});
