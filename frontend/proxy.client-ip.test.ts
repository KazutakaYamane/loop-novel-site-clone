import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { proxy } from "./proxy";

// proxy が Laravel への転送に付けるリクエストのヘッダー。Next.js はレスポンスの x-middleware-* で受け渡す
function forwardedHeader(response: Response, name: string): string | null {
  const overridden = (response.headers.get("x-middleware-override-headers") ?? "").split(",");
  if (!overridden.includes(name)) {
    return null;
  }
  return response.headers.get(`x-middleware-request-${name}`);
}

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://web:3000/api/demo-sessions", { method: "POST", headers });
}

describe("proxy and the client's IP address @AC-F2-7", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("forwards the client's address to Laravel in X-User-IP", () => {
    const response = proxy(request({ "X-Forwarded-For": "203.0.113.7" }));

    expect(forwardedHeader(response, "x-user-ip")).toBe("203.0.113.7");
  });

  test("replaces an X-User-IP the browser sent with the client's address", () => {
    const response = proxy(request({ "X-Forwarded-For": "203.0.113.7", "X-User-IP": "198.51.100.1" }));

    expect(forwardedHeader(response, "x-user-ip")).toBe("203.0.113.7");
  });

  test("drops an X-User-IP the browser sent when the client's address is unknown", () => {
    const response = proxy(request({ "X-User-IP": "198.51.100.1" }));

    expect(response.headers.get("x-middleware-override-headers")).not.toBeNull();
    expect(forwardedHeader(response, "x-user-ip")).toBeNull();
  });

  test("keeps the other request headers, such as the session cookie and the CSRF token", () => {
    const response = proxy(
      request({ "X-Forwarded-For": "203.0.113.7", Cookie: "yomikaki_session=s", "X-CSRF-TOKEN": "t" }),
    );

    expect(forwardedHeader(response, "cookie")).toBe("yomikaki_session=s");
    expect(forwardedHeader(response, "x-csrf-token")).toBe("t");
  });
});
