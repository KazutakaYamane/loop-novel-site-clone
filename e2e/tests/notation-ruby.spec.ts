import { expect, test } from "../support/clientAddress";
import { publishNotationEpisode } from "../support/publishNotationEpisode";

test("the public episode displays ruby and preserves unconverted notation", {
  tag: ["@AC-F5-1", "@AC-F5-2", "@AC-F5-3", "@AC-F5-4", "@AC-F5-5", "@AC-F5-13"],
}, async ({ page }) => {
  const body = await publishNotationEpisode(page, [
    "今日は東京《とうきょう》へ",
    "佐々木《ささき》と〆《しめ》ヶ《が》〇《まる》",
    "ひらがな《ルビ》",
    "｜ロンドン《倫敦》と|Paris《パリ》",
    "｜あ《》い《う》",
    "漢字《》",
  ].join("\n"));

  await expect(body).toBeVisible();
  await expect(body.locator("ruby > rt")).toHaveText(["とうきょう", "ささき", "しめ", "が", "まる", "倫敦", "パリ"]);
  expect(await body.locator("ruby").evaluateAll((elements) =>
    elements.map((ruby) => ruby.firstChild?.textContent),
  )).toEqual(["東京", "佐々木", "〆", "ヶ", "〇", "ロンドン", "Paris"]);
  expect(await body.textContent()).toBe([
    "今日は東京とうきょうへ",
    "佐々木ささきと〆しめヶが〇まる",
    "ひらがな《ルビ》",
    "ロンドン倫敦とParisパリ",
    "｜あ《》い《う》",
    "漢字《》",
  ].join("\n"));
});
