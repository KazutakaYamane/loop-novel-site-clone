import { expect, test } from "@playwright/test";

const apiURL = process.env.API_URL ?? "http://nginx:8080";

test("the top page is served by Next.js", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "To get started, edit the page.tsx file.",
  );
});

test("the Laravel API answers its health check through nginx", async ({ request }) => {
  const response = await request.get(`${apiURL}/up`);

  expect(response.status()).toBe(200);
});
