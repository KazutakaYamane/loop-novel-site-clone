import { describe, expect, it } from "vitest";
import { formatCharacterCount } from "./format-character-count";

describe("formatCharacterCount", () => {
  it("formats", () => {
    expect(formatCharacterCount(0)).toBe("0文字");
    expect(formatCharacterCount(12345)).toBe("12,345文字");
  });
});
