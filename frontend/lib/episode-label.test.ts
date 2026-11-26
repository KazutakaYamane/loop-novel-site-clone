import { expect, test } from "vitest";
import { episodeLabel } from "./episode-label";

test("an episode number is labeled with 第 and 話", () => {
  expect(episodeLabel(1)).toBe("第1話");
  expect(episodeLabel(12)).toBe("第12話");
});
