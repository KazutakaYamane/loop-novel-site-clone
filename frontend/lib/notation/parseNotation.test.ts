import { describe, expect, test } from "vitest";
import { parseNotation } from "./parseNotation";

const kanji = (count: number) => "漢".repeat(count);
const reading = (count: number) => "よ".repeat(count);
const ivs = "\u{E0100}";
const svs = "︀";

function literal(source: string) {
  expect(parseNotation(source).join("")).toBe(source);
  expect(parseNotation(source).filter((part) => typeof part !== "string")).toEqual([]);
}

describe("@AC-F5-6 ruby is limited to 50 code points and its base to 20", () => {
  test("a reading of exactly 50 code points becomes ruby", () => {
    expect(parseNotation(`東京《${reading(50)}》`)).toEqual(["", { base: "東京", reading: reading(50) }, ""]);
  });

  test.each([
    `東京《${reading(51)}》`,
    `｜ロンドン《${reading(51)}》`,
    `｜ロンドン《${reading(51)}》`.replace("｜", "|"),
  ])("a reading of 51 code points stays literal in %s", literal);

  test("the reading length is counted in code points, not UTF-16 units", () => {
    const selectors = `葛${ivs}`.repeat(25);
    expect(parseNotation(`｜しるし《${selectors}》`)).toEqual(["", { base: "しるし", reading: selectors }, ""]);
    literal(`｜しるし《${selectors}あ》`);
  });

  test("a vertical bar before an overlong reading stays literal and does not carry over", () => {
    expect(parseNotation(`｜あ《${reading(51)}》東京《とうきょう》`)).toEqual([
      `｜あ《${reading(51)}》`,
      { base: "東京", reading: "とうきょう" },
      "",
    ]);
  });

  test("an explicit base of exactly 20 code points becomes ruby", () => {
    expect(parseNotation(`｜${"あ".repeat(20)}《よみ》`)).toEqual(["", { base: "あ".repeat(20), reading: "よみ" }, ""]);
  });

  test("an explicit base is counted in code points including variation selectors", () => {
    const base = `葛${svs}`.repeat(10);
    expect(parseNotation(`｜${base}《よみ》`)).toEqual(["", { base, reading: "よみ" }, ""]);
    literal(`｜${base}あ《よみ》`);
  });
});

describe("@AC-F5-7 an overlong automatic base keeps the 20 kanji nearest to the bracket", () => {
  test("exactly 20 kanji become the base", () => {
    expect(parseNotation(`あ${kanji(20)}《るび》`)).toEqual(["あ", { base: kanji(20), reading: "るび" }, ""]);
  });

  test("21 kanji leave the first one as text", () => {
    expect(parseNotation(`一${kanji(20)}《るび》`)).toEqual(["一", { base: kanji(20), reading: "るび" }, ""]);
  });

  test("a long run keeps the last 20 kanji", () => {
    expect(parseNotation(`前${"一".repeat(30)}${kanji(20)}《るび》後`)).toEqual([
      `前${"一".repeat(30)}`,
      { base: kanji(20), reading: "るび" },
      "後",
    ]);
  });

  test("the overlong base and the overlong reading together stay literal", () => {
    literal(`${kanji(21)}《${reading(51)}》`);
  });
});

describe("@AC-F5-8 an overlong explicit base falls back to automatic ruby", () => {
  test("a bar and 21 kanji keep the bar and the first kanji as text", () => {
    expect(parseNotation(`｜一${kanji(20)}《るび》`)).toEqual(["｜一", { base: kanji(20), reading: "るび" }, ""]);
    expect(parseNotation(`|一${kanji(20)}《るび》`)).toEqual(["|一", { base: kanji(20), reading: "るび" }, ""]);
  });

  test("only the kanji just before the bracket become the base", () => {
    expect(parseNotation(`｜${"あ".repeat(20)}東京《とうきょう》`)).toEqual([
      `｜${"あ".repeat(20)}`,
      { base: "東京", reading: "とうきょう" },
      "",
    ]);
  });

  test.each([
    `｜${"あ".repeat(21)}《よみ》`,
    `｜${"漢あ".repeat(11)}《よみ》`,
    `｜${`葛${ivs}`.repeat(20)}《よみ》`,
  ])("stays literal when no kanji precede the bracket in %s", literal);

  test("the fallback with an empty reading stays literal", () => {
    literal(`｜${kanji(21)}《》`);
  });

  test("the bar does not carry over to the next bracket after the fallback", () => {
    expect(parseNotation(`｜${"あ".repeat(21)}《よみ》い《う》`)).toEqual([`｜${"あ".repeat(21)}《よみ》い《う》`]);
  });
});

describe("@AC-F5-11 notation does not cross a line break", () => {
  test.each([
    "東京《とうきょう",
    "東京《とうきょう\n》",
    "東京《とうきょう\r\n》",
    "｜ロンドン《倫敦\n》",
    "｜ロンドン\n《倫敦》",
  ])("keeps %j literal", literal);

  test("the next line is still parsed", () => {
    expect(parseNotation("東京《とうきょう\n大阪《おおさか》")).toEqual([
      "東京《とうきょう\n",
      { base: "大阪", reading: "おおさか" },
      "",
    ]);
  });

  test("a bar on the previous line does not reach the bracket on the next line", () => {
    expect(parseNotation("｜あ\n東京《とうきょう》")).toEqual([
      "｜あ\n",
      { base: "東京", reading: "とうきょう" },
      "",
    ]);
  });
});

describe("@AC-F5-14 variation selectors are not kanji", () => {
  test.each([ivs, svs])("the kanji run breaks at selector %j", (selector) => {
    expect(parseNotation(`葛${selector}城《かつらぎ》`)).toEqual([
      `葛${selector}`,
      { base: "城", reading: "かつらぎ" },
      "",
    ]);
  });

  test("a selector just before the bracket leaves no automatic base", () => {
    literal(`葛${ivs}《かつら》`);
  });
});

describe("@AC-F5-16 HTML in the notation is kept as text", () => {
  const html = "<img src=x onerror=alert(1)>";

  test("HTML in the base and the reading is passed through as plain strings", () => {
    expect(parseNotation(`${html}東京《${html}》`)).toEqual([html, { base: "東京", reading: html }, ""]);
    expect(parseNotation(`｜${html}《よみ》`.replace(html, "<b>"))).toEqual(["", { base: "<b>", reading: "よみ" }, ""]);
  });

  test("HTML before the kanji of an overlong explicit base stays in the literal part", () => {
    expect(parseNotation(`｜${html}${kanji(10)}《よみ》`)).toEqual([`｜${html}`, { base: kanji(10), reading: "よみ" }, ""]);
  });

  test.each([
    `東京《${html}${reading(30)}》`,
    `東京《${html}`,
    `｜${html}《よみ》`,
  ])("an overlong or unclosed notation with HTML stays literal: %s", literal);
});
