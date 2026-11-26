import { expect, test } from "@playwright/test";

test("a page that does not exist is served", async ({ page }) => {
  const response = await page.goto("/no-such-page-for-check");

  expect(response?.status()).toBe(200);
});
