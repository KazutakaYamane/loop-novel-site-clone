import { expect, test } from "@playwright/test";

// デモのボタンを要素単位で撮る。ヘッダーの右側の領域には #122 が「ログイン」を足すので、ボタンの要素だけを撮る(docs/adr/0016)
test("the demo buttons on the top page", async ({ page }) => {
  await page.goto("/");
  const buttons = page.getByRole("main").getByTestId("demo-login-buttons");
  await expect(buttons.getByRole("button", { name: "デモ読者として始める" })).toBeVisible();

  await expect(buttons).toHaveScreenshot("demo-buttons-top.png");
});

test("the demo buttons in the header", async ({ page }) => {
  await page.goto("/");
  const buttons = page.getByRole("banner").getByTestId("demo-login-buttons");
  await expect(buttons.getByRole("button", { name: "デモ読者として始める" })).toBeVisible();

  await expect(buttons).toHaveScreenshot("demo-buttons-header.png");
});

// デモログインは PC とスマートフォンで 1 回ずつ。ユーザー名(#122 で形式が決まる)とログアウト(#122)が入る右側の領域は隠す
test("the header while logged in as a demo reader", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  const header = page.getByRole("banner");
  await expect(header.getByTestId("current-user")).toBeVisible();

  await expect(header).toHaveScreenshot("header-logged-in.png", { mask: [header.getByTestId("header-actions")] });
});
