import { expect, test } from "@playwright/test";

test("the top page looks the same as the baseline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await expect(page).toHaveScreenshot("top.png", { fullPage: true });
});
