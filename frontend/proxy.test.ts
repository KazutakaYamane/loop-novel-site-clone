import { NextRequest } from "next/server";
import { getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("forwards same-origin API requests to Laravel with the path and query", () => {
    const response = proxy(new NextRequest("http://localhost:3000/api/demo-sessions?a=1&b=2"));

    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe("http://nginx:8080/api/demo-sessions?a=1&b=2");
  });

  test("uses the API address given at run time", () => {
    vi.stubEnv("INTERNAL_API_URL", "http://api:8080");

    expect(getRewrittenUrl(proxy(new NextRequest("http://web:3000/api/user")))).toBe("http://api:8080/api/user");
  });

  test("runs only for API paths", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/user" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/csrf-token" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/" })).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, url: "/apiary" })).toBe(false);
  });
});
