import { expect, test } from "vitest";
import { pageCount } from "./page-count";

test("a text has pages", () => {
  expect(pageCount(1200)).toBeGreaterThan(0);
});
