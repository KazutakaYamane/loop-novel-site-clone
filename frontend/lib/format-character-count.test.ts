import { expect, test } from "vitest";
import { formatCharacterCount } from "./format-character-count";

test("zero characters is shown without separators", () => {
  expect(formatCharacterCount(0)).toBe("0文字");
});

test("thousands are separated with commas", () => {
  expect(formatCharacterCount(12345)).toBe("12,345文字");
});
