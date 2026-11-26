import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "./logger";

function lastLine(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const calls = spy.mock.calls;
  expect(calls).toHaveLength(1);
  expect(calls[0]).toHaveLength(1);
  const line = calls[0][0];
  expect(typeof line).toBe("string");
  expect(line as string).not.toContain("\n");
  return JSON.parse(line as string) as Record<string, unknown>;
}

describe("logger", () => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T04:00:00.000Z"));
    stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    stderr = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("writes the level, the message, the time and the context as one JSON line", () => {
    logger.info("作品を保存した", { workId: 42, title: "テスト" });

    expect(lastLine(stdout)).toEqual({
      level: "info",
      message: "作品を保存した",
      time: "2026-11-27T04:00:00.000Z",
      context: { workId: 42, title: "テスト" },
    });
    expect(stderr).not.toHaveBeenCalled();
  });

  test("writes an empty context when none is given", () => {
    logger.debug("開始");

    expect(lastLine(stdout)).toEqual({
      level: "debug",
      message: "開始",
      time: "2026-11-27T04:00:00.000Z",
      context: {},
    });
    expect(stderr).not.toHaveBeenCalled();
  });

  test.each([
    ["warn", logger.warn],
    ["error", logger.error],
  ] as const)("writes %s to stderr", (level, log) => {
    log("失敗した", { status: 500 });

    expect(lastLine(stderr)).toEqual({
      level,
      message: "失敗した",
      time: "2026-11-27T04:00:00.000Z",
      context: { status: 500 },
    });
    expect(stdout).not.toHaveBeenCalled();
  });

  test("writes the name, the message and the stack of an Error in the context", () => {
    const error = new TypeError("壊れた");

    logger.error("取得に失敗した", { error, nested: { cause: new Error("元") } });

    const entry = lastLine(stderr);
    const context = entry.context as {
      error: Record<string, unknown>;
      nested: { cause: Record<string, unknown> };
    };
    expect(context.error).toEqual({ name: "TypeError", message: "壊れた", stack: error.stack });
    expect(context.nested.cause).toMatchObject({ name: "Error", message: "元" });
  });
});
