// AC-F1-5 のログイン画面の確認は別の PR で追加する
import { expect, test } from "@playwright/test";

test("the top page opens", { tag: "@AC-F1-4" }, async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Create Next App");
});
