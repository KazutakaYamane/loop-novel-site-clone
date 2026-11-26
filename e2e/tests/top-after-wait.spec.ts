import { expect, test } from "@playwright/test";

test("the top page shows its title after loading", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(3000);

  await expect(page).toHaveTitle("Create Next App");
});
