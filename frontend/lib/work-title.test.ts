import { expect, test } from "vitest";
import { workTitle } from "./work-title";

test("the title of a work is read", () => {
  expect(workTitle({ title: "序章" })).toBe("序章");
});
