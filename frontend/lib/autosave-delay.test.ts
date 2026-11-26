import { afterEach, expect, test, vi } from "vitest";
import { autosaveDelayMs } from "./autosave-delay";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("there is no autosave delay in the current environment", () => {
  expect(autosaveDelayMs()).toBe(0);
});

test("the autosave delay is 3000ms in production", () => {
  vi.stubEnv("NODE_ENV", "production");

  expect(autosaveDelayMs()).toBe(3000);
});
