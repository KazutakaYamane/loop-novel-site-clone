import { afterEach, describe, expect, test, vi } from "vitest";
import { startDemo } from "./startDemo";

// Laravel の CSRF トークンとデモログインの API を、デモログインが返す状態を決めて真似る
function fakeLaravel(demoStatus: number) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (String(input) === "/api/csrf-token") {
      return Response.json({ token: "t" });
    }
    if (String(input) === "/api/demo-sessions" && init?.method === "POST") {
      return Response.json({ message: "x" }, { status: demoStatus });
    }
    return new Response(null, { status: 404 });
  };
}

describe("startDemo and the demo login limit @AC-F2-7", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("tells the limit apart when Laravel refuses with 429", async () => {
    vi.stubGlobal("fetch", fakeLaravel(429));

    expect(await startDemo("reader")).toBe("rate-limited");
  });

  test("other refusals are plain failures", async () => {
    for (const status of [419, 422, 500, 503]) {
      vi.stubGlobal("fetch", fakeLaravel(status));

      expect(await startDemo("author")).toBe(false);
    }
  });
});
