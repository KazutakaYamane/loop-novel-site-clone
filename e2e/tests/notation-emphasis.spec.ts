import { expect, test } from "../support/clientAddress";
import { publishNotationEpisode } from "../support/publishNotationEpisode";

function dottedCharacters(elements: Element[]) {
  return elements.map((emphasis) => Array.from(emphasis.children, (character) => character.textContent));
}

test("an escaped bracket is shown as a bracket without the vertical bar", {
  tag: "@AC-F5-9",
}, async ({ page }) => {
  const lines = ["｜《", "|《ルビ》", "漢字｜《かんじ》", "｜《《傍点》》"];
  const body = await publishNotationEpisode(page, lines.join("\n"));

  await expect(body).toBeVisible();
  expect(await body.textContent()).toBe(["《", "《ルビ》", "漢字《かんじ》", "《《傍点》》"].join("\n"));
  await expect(body.locator("ruby, em")).toHaveCount(0);
});

test("double brackets put emphasis dots on every character and an empty pair stays literal", {
  tag: "@AC-F5-10",
}, async ({ page }) => {
  const long = "長".repeat(300);
  const lines = ["夜の《《月明かり》》が見える", `《《${long}》》`, "《《》》"];
  const body = await publishNotationEpisode(page, lines.join("\n"));

  await expect(body).toBeVisible();
  expect(await body.textContent()).toBe(["夜の月明かりが見える", long, "《《》》"].join("\n"));
  expect(await body.locator("em").evaluateAll(dottedCharacters)).toEqual([["月", "明", "か", "り"], Array.from(long)]);
});

test("notation inside ruby and inside emphasis is shown as text", {
  tag: "@AC-F5-12",
}, async ({ page }) => {
  const lines = ["漢字《｜かな》", "《《東京《とうきょう》へ》》"];
  const body = await publishNotationEpisode(page, lines.join("\n"));

  await expect(body).toBeVisible();
  expect(await body.textContent()).toBe(["漢字｜かな", "東京《とうきょう》へ"].join("\n"));
  await expect(body.locator("ruby > rt")).toHaveText(["｜かな"]);
  await expect(body.locator("em ruby")).toHaveCount(0);
  expect(await body.locator("em").evaluateAll(dottedCharacters)).toEqual([Array.from("東京《とうきょう》へ")]);
});

test("a kanji outside the BMP is a single kanji for ruby and emphasis", {
  tag: "@AC-F5-15",
}, async ({ page }) => {
  const body = await publishNotationEpisode(page, "𠮟《しか》られた。大𠮟責《だいしっせき》と《《𠮟咤》》");

  await expect(body).toBeVisible();
  await expect(body.locator("ruby > rt")).toHaveText(["しか", "だいしっせき"]);
  expect(await body.locator("ruby").evaluateAll((elements) =>
    elements.map((ruby) => ruby.firstChild?.textContent),
  )).toEqual(["𠮟", "大𠮟責"]);
  expect(await body.locator("em").evaluateAll(dottedCharacters)).toEqual([["𠮟", "咤"]]);
});

for (const [name, line] of [["《", "《".repeat(100000)], ["《《", "《《".repeat(50000)]] as const) {
  test(`a body of a line full of unclosed ${name} is shown as text`, {
    tag: "@AC-F5-17",
  }, async ({ page }) => {
    const body = await publishNotationEpisode(page, line);

    await expect(body).toBeVisible();
    expect(await body.textContent()).toBe(line);
    await expect(body.locator("ruby, em")).toHaveCount(0);
  });
}
