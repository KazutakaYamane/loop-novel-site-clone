import { afterEach, expect, test, vi } from "vitest";
import { autosaveDelayMs } from "./autosave-delay";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("autosave runs without delay in the current environment", () => {
  expect(autosaveDelayMs()).toBe(0);
});

test("autosave waits 3 seconds in production", () => {
  vi.stubEnv("NODE_ENV", "production");

  expect(autosaveDelayMs()).toBe(3000);
});
