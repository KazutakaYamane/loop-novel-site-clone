import { expect, test } from "vitest";
import { formatCharacterCount } from "./format-character-count";

test("zero is shown as 0文字", () => {
  expect(formatCharacterCount(0)).toBe("0文字");
});

test("large counts are grouped by thousands", () => {
  expect(formatCharacterCount(12345)).toBe("12,345文字");
});
