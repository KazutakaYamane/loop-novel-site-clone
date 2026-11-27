import { expect, test } from "../support/clientAddress";

test("the public episode with unformatted text and navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
  const readerWork = new URL(page.url()).pathname.split("/episodes/")[0].replace(/^\/my/, "");
  await page.goto(readerWork);
  await page.getByRole("navigation", { name: "目次" }).getByRole("link", { name: "第1話 岬の灯台" }).click();

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "第1話 岬の灯台" })).toBeVisible();
  await expect(main).toHaveScreenshot("public-episode.png");
});
