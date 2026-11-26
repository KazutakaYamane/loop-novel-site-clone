import { expect, test } from "@playwright/test";

test.fixme("存在しないページも表示できる", async ({ page }) => {
  const response = await page.goto("/no-such-page-for-fixme");
  expect(response?.status()).toBe(200);
});
