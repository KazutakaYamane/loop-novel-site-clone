import { afterEach, expect, test, vi } from "vitest";
import { autosaveDelayMs } from "./autosave-delay";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("the delay in the current environment", () => {
  expect(autosaveDelayMs()).toBe(0);
});

test("the delay in production is 3 seconds", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(autosaveDelayMs()).toBe(3000);
});
