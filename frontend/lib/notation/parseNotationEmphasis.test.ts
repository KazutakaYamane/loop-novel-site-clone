import { describe, expect, test } from "vitest";
import { parseNotation } from "./parseNotation";

function literal(source: string) {
  expect(parseNotation(source).join("")).toBe(source);
  expect(parseNotation(source).filter((part) => typeof part !== "string")).toEqual([]);
}

describe("@AC-F5-9 a vertical bar before 《 escapes the bracket", () => {
  test.each([
    ["｜《", "《"],
    ["|《", "《"],
    ["｜《ルビ》", "《ルビ》"],
    ["漢字｜《かんじ》", "漢字《かんじ》"],
    ["｜《《傍点》》", "《《傍点》》"],
    ["|《《傍点》》", "《《傍点》》"],
  ])("%s is shown as %s", (source, text) => {
    expect(parseNotation(source).join("")).toBe(text);
    expect(parseNotation(source).filter((part) => typeof part !== "string")).toEqual([]);
  });

  test("notation after the escaped bracket is still parsed", () => {
    expect(parseNotation("｜《東京《とうきょう》")).toEqual(["《", { base: "東京", reading: "とうきょう" }, ""]);
  });

  test("a bar that is not just before the bracket stays a ruby marker", () => {
    expect(parseNotation("｜ロンドン《倫敦》｜《")).toEqual(["", { base: "ロンドン", reading: "倫敦" }, "《"]);
  });
});

describe("@AC-F5-10 double brackets add emphasis dots", () => {
  test("the content between 《《 and 》》 is emphasized", () => {
    expect(parseNotation("夜の《《月明かり》》が見える")).toEqual(["夜の", { emphasis: "月明かり" }, "が見える"]);
  });

  test("the content has no length limit", () => {
    const content = "あ".repeat(10000);
    expect(parseNotation(`《《${content}》》`)).toEqual(["", { emphasis: content }, ""]);
  });

  test.each(["《《》》", "漢字《《》》", "｜あ《《》》"])("empty emphasis %s stays literal", literal);

  test("kanji just before the double brackets do not become a ruby base", () => {
    expect(parseNotation("漢字《《傍点》》")).toEqual(["漢字", { emphasis: "傍点" }, ""]);
  });

  test.each(["《《傍点", "《《傍点》", "《《傍点\n》》"])("unclosed emphasis %j stays literal", literal);

  test("several emphases on one line", () => {
    expect(parseNotation("《《一》》と《《二》》")).toEqual(["", { emphasis: "一" }, "と", { emphasis: "二" }, ""]);
  });
});

describe("@AC-F5-12 notation is not parsed inside ruby or emphasis", () => {
  test("ruby inside emphasis stays literal text", () => {
    expect(parseNotation("《《東京《とうきょう》へ》》")).toEqual(["", { emphasis: "東京《とうきょう》へ" }, ""]);
  });

  test("a bar inside emphasis stays literal text", () => {
    expect(parseNotation("《《｜ロンドン《倫敦》の》》")).toEqual(["", { emphasis: "｜ロンドン《倫敦》の" }, ""]);
  });

  test("notation inside a ruby reading stays literal text", () => {
    expect(parseNotation("漢字《｜かな》")).toEqual(["", { base: "漢字", reading: "｜かな" }, ""]);
    expect(parseNotation("漢字《東京《とうきょう》")).toEqual(["", { base: "漢字", reading: "東京《とうきょう" }, ""]);
  });
});

describe("@AC-F5-15 kanji outside the BMP count as one kanji", () => {
  test("a surrogate-pair kanji becomes an automatic base", () => {
    expect(parseNotation("𠮟《しか》る")).toEqual(["", { base: "𠮟", reading: "しか" }, "る"]);
    expect(parseNotation("𩸽《ほっけ》と鮭《さけ》")).toEqual(["", { base: "𩸽", reading: "ほっけ" }, "と", { base: "鮭", reading: "さけ" }, ""]);
  });

  test("surrogate-pair kanji join the run of other kanji", () => {
    expect(parseNotation("あ大𠮟責《だいしっせき》")).toEqual(["あ", { base: "大𠮟責", reading: "だいしっせき" }, ""]);
  });

  test("an automatic base of 20 surrogate-pair kanji is counted in characters", () => {
    expect(parseNotation(`𠮟${"𠮟".repeat(20)}《るび》`)).toEqual(["𠮟", { base: "𠮟".repeat(20), reading: "るび" }, ""]);
  });
});

describe("@AC-F5-17 lines full of unclosed brackets are parsed in linear time", () => {
  // 線形の走査なら数十ミリ秒で終わる。2 乗の走査は数十秒かかるので、CI の揺れに余裕を持たせても区別できる。
  const limitMs = 1000;

  test.each([
    ["《", "《".repeat(100000)],
    ["《《", "《《".repeat(50000)],
    ["《《》", "《《》".repeat(33333)],
    ["漢《《", "漢《《".repeat(33333)],
    ["｜《", "｜あ《".repeat(33333)],
  ])("a line of %s repeated", (_, source) => {
    const started = performance.now();
    const parts = parseNotation(source);
    expect(performance.now() - started).toBeLessThan(limitMs);
    expect(parts.join("")).toBe(source);
  });
});
