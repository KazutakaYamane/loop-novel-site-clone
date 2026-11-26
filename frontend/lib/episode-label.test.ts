import { expect, test } from "vitest";
import { episodeLabel } from "./episode-label";

test("the episode number is wrapped in 第 and 話", () => {
  expect(episodeLabel(1)).toBe("第1話");
  expect(episodeLabel(12)).toBe("第12話");
});
