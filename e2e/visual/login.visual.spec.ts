import { expect, test } from "../support/clientAddress";

// ヘッダーの「ログイン」とログアウトは要素単位で撮る。ログイン画面はページ全体を撮り、
// 後の issue が中身を変えるヘッダーの操作の領域を隠す(docs/adr/0016)
test("the login link in the header", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("banner").getByRole("link", { name: "ログイン" });
  await expect(link).toBeVisible();

  await expect(link).toHaveScreenshot("header-login-link.png");
});

test("the logout button in the header", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  const button = page.getByRole("banner").getByRole("button", { name: "ログアウト" });
  await expect(button).toBeVisible();

  await expect(button).toHaveScreenshot("header-logout-button.png");
});

test("the login page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("main").getByRole("button", { name: "デモ読者として始める" })).toBeVisible();

  await expect(page).toHaveScreenshot("login-page.png", {
    fullPage: true,
    mask: [page.getByRole("banner").getByTestId("header-actions")],
  });
});
