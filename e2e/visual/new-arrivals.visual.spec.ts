import { expect, test } from "../support/clientAddress";

// 新着の中身は並列のテストとシードで変わるので、トップ全体は撮らない(ADR 0016、0027)。
// 作品のカードは、デモ作者の初期の作品(題名と紹介文が決まっている)の 1 枚を撮り、作者名を隠す
test("a work card in the new arrivals", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
  const [, workId] = new URL(page.url()).pathname.match(/\/works\/(\d+)\//) ?? [];
  await page.goto("/");

  const card = page.getByTestId("new-arrival-work").filter({ has: page.locator(`a[href="/works/${workId}"]`) });
  await expect(card.getByText("第1話 岬の灯台", { exact: true })).toBeVisible();
  await expect(card).toHaveScreenshot("new-arrival-card.png", { mask: [card.getByTestId("new-arrival-author")] });
});

// 作品の無いページを開くと、見出し・空の案内・「前へ」だけが並び、中身が実行で変わらない
test("the new arrivals heading and pager on a page past the last work", async ({ page }) => {
  await page.goto("/new-arrivals?page=9999");

  const newArrivals = page.getByTestId("new-arrivals");
  await expect(newArrivals.getByRole("link", { name: "前へ" })).toBeVisible();
  await expect(newArrivals).toHaveScreenshot("new-arrivals-empty-page.png");
});
