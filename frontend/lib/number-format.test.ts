import { expect, test } from "vitest";

test("numbers are formatted without separators", () => {
  expect(new Intl.NumberFormat("ja-JP").format(1234)).toBe("1234");
});
