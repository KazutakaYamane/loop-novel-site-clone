import { expect, test } from "../support/clientAddress";

// 上限の案内の見た目だけを撮る。デモログインの API の 429 はテストの側でブラウザの通信を差し替えて返し、
// 送信元の回数を使わない。本物の上限に当てて確かめるのは e2e/tests/demo-login-rate-limit.spec.ts(docs/adr/0017)
test.beforeEach(async ({ page }) => {
  await page.route("**/api/demo-sessions", (route) =>
    route.fulfill({ status: 429, json: { message: "Too Many Attempts." }, headers: { "Retry-After": "3600" } }),
  );
});

test("the demo login limit message on the top page", async ({ page }) => {
  await page.goto("/");
  const buttons = page.getByRole("main").getByTestId("demo-login-buttons");
  await buttons.getByRole("button", { name: "デモ読者として始める" }).click();
  await expect(buttons.getByRole("alert")).toBeVisible();

  await expect(buttons).toHaveScreenshot("demo-login-limit-top.png");
});

test("the demo login limit message in the header", async ({ page }) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "デモ読者として始める" }).click();
  const alert = header.getByRole("alert");
  await expect(alert).toBeVisible();

  await expect(alert).toHaveScreenshot("demo-login-limit-header.png");
});
