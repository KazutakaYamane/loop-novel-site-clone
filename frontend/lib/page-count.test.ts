import { expect, test } from "vitest";
import { pageCount } from "./page-count";

test("characters are counted as pages", () => {
  expect(pageCount(1200)).toBeGreaterThan(0);
});
