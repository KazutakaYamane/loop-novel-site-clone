import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { startDemo } from "./startDemo";

type Recorded = { url: string; init: RequestInit | undefined };

// Laravel の CSRF トークンとデモログインの API を、1 つのセッションの状態で真似る
function fakeLaravel(recorded: Recorded[], options: { demoStatus?: number; tokenStatus?: number } = {}) {
  const token = "session-token";
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    recorded.push({ url: String(input), init });
    if (String(input) === "/api/csrf-token" && (init?.method ?? "GET") === "GET") {
      return Response.json({ token }, { status: options.tokenStatus ?? 200 });
    }
    if (String(input) === "/api/demo-sessions" && init?.method === "POST") {
      if (new Headers(init.headers).get("X-CSRF-TOKEN") !== token) {
        return Response.json({ message: "CSRF token mismatch." }, { status: 419 });
      }
      const role = JSON.parse(String(init.body)).role;
      if (role !== "author" && role !== "reader") {
        return Response.json({ message: "invalid" }, { status: 422 });
      }
      return Response.json({ name: role }, { status: options.demoStatus ?? 201 });
    }
    return new Response(null, { status: 404 });
  };
}

describe("startDemo", () => {
  let recorded: Recorded[];

  beforeEach(() => {
    recorded = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("@AC-F1-4 sends the demo login with the session's CSRF token from the same origin", async () => {
    vi.stubGlobal("fetch", fakeLaravel(recorded));

    expect(await startDemo("reader")).toBe(true);

    expect(recorded.map((r) => r.url)).toEqual(["/api/csrf-token", "/api/demo-sessions"]);
    const post = recorded[1].init;
    expect(post?.method).toBe("POST");
    expect(post?.credentials).toBe("same-origin");
    expect(recorded[0].init?.credentials).toBe("same-origin");
    const headers = new Headers(post?.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(post?.body))).toEqual({ role: "reader" });
    expect(new Headers(recorded[0].init?.headers).get("Accept")).toBe("application/json");
  });

  test("@AC-F2-2 sends the author role for the author button", async () => {
    vi.stubGlobal("fetch", fakeLaravel(recorded));

    expect(await startDemo("author")).toBe(true);
    expect(JSON.parse(String(recorded[1].init?.body))).toEqual({ role: "author" });
  });

  test("reports failure when the demo login is refused", async () => {
    vi.stubGlobal("fetch", fakeLaravel(recorded, { demoStatus: 500 }));

    expect(await startDemo("reader")).toBe(false);
  });

  test("does not send the demo login when no CSRF token could be obtained", async () => {
    vi.stubGlobal("fetch", fakeLaravel(recorded, { tokenStatus: 500 }));

    expect(await startDemo("reader")).toBe(false);
    expect(recorded.map((r) => r.url)).toEqual(["/api/csrf-token"]);
  });
});
