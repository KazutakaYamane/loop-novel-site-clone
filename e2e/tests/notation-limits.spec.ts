import { expect, test } from "../support/clientAddress";
import { publishNotationEpisode } from "../support/publishNotationEpisode";

const kanji20 = "漢".repeat(20);
const longReading = "よ".repeat(51);
const longExplicitBase = "あ".repeat(21);
const ivs = "\u{E0100}";

test("the public episode applies the ruby length limits, line breaks and variation selectors", {
  tag: ["@AC-F5-6", "@AC-F5-7", "@AC-F5-8", "@AC-F5-11", "@AC-F5-14"],
}, async ({ page }) => {
  const lines = [
    `東京《${longReading}》`,
    `東京《${"よ".repeat(50)}》`,
    `一${kanji20}《るび》`,
    `｜一${kanji20}《るび》`,
    `｜${longExplicitBase}《よみ》`,
    "東京《とうきょう",
    "》大阪《おおさか》",
    `葛${ivs}城《かつらぎ》`,
  ];
  const body = await publishNotationEpisode(page, lines.join("\n"));

  await expect(body).toBeVisible();
  await expect(body.locator("ruby > rt")).toHaveText(["よ".repeat(50), "るび", "るび", "おおさか", "かつらぎ"]);
  expect(await body.locator("ruby").evaluateAll((elements) =>
    elements.map((ruby) => ruby.firstChild?.textContent),
  )).toEqual(["東京", kanji20, kanji20, "大阪", "城"]);
  expect(await body.textContent()).toBe([
    `東京《${longReading}》`,
    `東京${"よ".repeat(50)}`,
    `一${kanji20}るび`,
    `｜一${kanji20}るび`,
    `｜${longExplicitBase}《よみ》`,
    "東京《とうきょう",
    "》大阪おおさか",
    `葛${ivs}城かつらぎ`,
  ].join("\n"));
});

test("HTML in the episode body and inside the notation is shown as text and never runs", {
  tag: "@AC-F5-16",
}, async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const script = "<script>window.__xss = true; alert('script')</script>";
  const handler = "<img src=x onerror=\"window.__xss = true; alert('handler')\">";
  const lines = [
    `本文${script}${handler}`,
    `東京《${handler}${"よ".repeat(30)}》`,
    `｜${script}《よみ》`,
    `｜${handler}東京《とうきょう》`,
    `大阪《${script}`,
    `京都《${"<b>"}》`,
  ];
  const body = await publishNotationEpisode(page, lines.join("\n"));

  await expect(body).toBeVisible();
  expect(await body.textContent()).toBe([
    `本文${script}${handler}`,
    `東京《${handler}${"よ".repeat(30)}》`,
    `｜${script}《よみ》`,
    `｜${handler}東京とうきょう`,
    `大阪《${script}`,
    "京都<b>",
  ].join("\n"));
  await expect(body.locator("script, img, b")).toHaveCount(0);
  await expect(body.locator("ruby > rt")).toHaveText(["とうきょう", "<b>"]);
  expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  expect(dialogs).toEqual([]);
});
