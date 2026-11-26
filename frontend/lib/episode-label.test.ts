import { expect, test } from "vitest";
import { episodeLabel } from "./episode-label";

test("an episode number is labeled as 第N話", () => {
  expect(episodeLabel(1)).toBe("第1話");
  expect(episodeLabel(12)).toBe("第12話");
});
