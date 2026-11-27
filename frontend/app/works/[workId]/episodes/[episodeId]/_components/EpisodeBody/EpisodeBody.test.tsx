import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { EpisodeBody } from "./EpisodeBody";

function expectRendering(source: string, text: string, annotations: readonly (readonly [string, string])[]) {
  render(<EpisodeBody body={source} />);

  const body = screen.getByTestId("episode-body");
  expect(body.textContent).toBe(text);
  expect(Array.from(body.querySelectorAll("ruby"), (ruby) => [
    ruby.firstChild?.textContent,
    ruby.querySelector("rt")?.textContent,
  ])).toEqual(annotations);
}

test.each([
  ["漢字《かんじ》", "漢字かんじ", [["漢字", "かんじ"]]],
  ["今日は東京《とうきょう》へ", "今日は東京とうきょうへ", [["東京", "とうきょう"]]],
] as const)("@AC-F5-1 annotates the contiguous kanji in %s", expectRendering);

test.each([
  ["佐々木《ささき》", "佐々木ささき", [["佐々木", "ささき"]]],
  ["〆《しめ》ヶ《が》〇《まる》", "〆しめヶが〇まる", [["〆", "しめ"], ["ヶ", "が"], ["〇", "まる"]]],
  ["神《かみ》", "神かみ", [["神", "かみ"]]],
] as const)("@AC-F5-2 recognizes kanji in %s", expectRendering);

test.each(["ひらがな《ルビ》", "漢字とひらがな《ルビ》", "《ルビ》"])(
  "@AC-F5-3 keeps %s literal when there is no kanji base",
  (source) => expectRendering(source, source, []),
);

test.each([
  ["｜ロンドン《倫敦》", "ロンドン倫敦", [["ロンドン", "倫敦"]]],
  ["街へ|London《ロンドン》から", "街へLondonロンドンから", [["London", "ロンドン"]]],
] as const)("@AC-F5-4 annotates the explicit base in %s", expectRendering);

test.each([
  ["｜あ《》い《う》", "｜あ《》い《う》", []],
  ["|あ《え》い《う》", "あえい《う》", [["あ", "え"]]],
  ["｜あ《》東京《とうきょう》", "｜あ《》東京とうきょう", [["東京", "とうきょう"]]],
  ["縦線｜と|", "縦線｜と|", []],
] as const)("@AC-F5-5 applies a vertical bar only to the next ruby candidate in %s", expectRendering);

test("@AC-F5-13 preserves notation with an empty reading", () => {
  expectRendering("漢字《》", "漢字《》", []);
});
