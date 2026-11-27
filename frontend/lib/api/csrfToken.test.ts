import { afterEach, expect, test, vi } from "vitest";
import { fetchCsrfToken } from "./csrfToken";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("@AC-F1-4 reads the session's CSRF token from the same origin", async () => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return Response.json({ token: "session-token" });
  });

  expect(await fetchCsrfToken()).toBe("session-token");

  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe("/api/csrf-token");
  expect(requests[0].init?.credentials).toBe("same-origin");
  expect(new Headers(requests[0].init?.headers).get("Accept")).toBe("application/json");
});

test("returns null when the token cannot be read", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ message: "error" }, { status: 500 }));

  expect(await fetchCsrfToken()).toBeNull();
});
