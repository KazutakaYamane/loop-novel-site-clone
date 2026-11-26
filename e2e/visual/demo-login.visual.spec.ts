import { expect, test } from "@playwright/test";

// デモのボタンを要素単位で撮る(docs/adr/0013)
test("the demo buttons on the top page", async ({ page }) => {
  await page.goto("/");
  const buttons = page.getByRole("main").getByTestId("demo-login-buttons");
  await expect(buttons.getByRole("button", { name: "デモ読者として始める" })).toBeVisible();

  await expect(buttons).toHaveScreenshot("demo-buttons-top.png");
});
