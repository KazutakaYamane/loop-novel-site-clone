import { afterEach, expect, test, vi } from "vitest";
import { internalApiUrl } from "./internalApiUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("joins the path to the API address read at run time", () => {
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");

  expect(internalApiUrl("/api/user?x=1")).toBe("http://nginx:8080/api/user?x=1");
});

test("fails loudly when the API address is not configured", () => {
  vi.stubEnv("INTERNAL_API_URL", "");

  expect(() => internalApiUrl("/api/user")).toThrow("INTERNAL_API_URL");
});
