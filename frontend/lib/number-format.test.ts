import { expect, test } from "vitest";

test("numbers are formatted for ja-JP", () => {
  expect(new Intl.NumberFormat("ja-JP").format(1234)).toBe("1234");
});
