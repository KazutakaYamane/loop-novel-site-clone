import { expect, test } from "../support/clientAddress";

test("the public work and contents", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
  const readerWork = new URL(page.url()).pathname.split("/episodes/")[0].replace(/^\/my/, "");
  await page.goto(readerWork);

  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "第1話 岬の灯台" })).toBeVisible();
  await expect(main).toHaveScreenshot("public-work.png", { mask: [main.getByTestId("work-author")] });
});

test("the public not-found message", async ({ page }) => {
  await page.goto("/works/0");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "お探しのページは見つかりませんでした" })).toBeVisible();
  await expect(main).toHaveScreenshot("public-not-found.png");
});
