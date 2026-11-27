import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";
import type { Page } from "@playwright/test";

const notice = "個人情報を保持しないため、会員登録とログインを無効にしています。";

async function currentUserStatus(page: Page): Promise<number> {
  return (await page.request.get("/api/user", { headers: { Accept: "application/json" } })).status();
}

test("the header's login link leads a guest to the login page", { tag: "@AC-F1-6" }, async ({ page }) => {
  await page.goto("/");

  await page.getByRole("banner").getByRole("link", { name: "ログイン" }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "ログイン" })).toBeVisible();
});

test("there is no sign-up page", { tag: "@AC-F1-6" }, async ({ page }) => {
  for (const path of ["/register", "/signup", "/auth/register", "/login/register"]) {
    const response = await page.goto(path);

    expect(response?.status()).toBe(404);
  }
  await page.goto("/login");
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "ログイン" })).toBeVisible();
  await expect(page.getByRole("link", { name: /新規登録|会員登録/ })).toHaveCount(0);
});

test(
  "the login page explains that sign-up and login are disabled and has no email or password fields",
  { tag: "@AC-F1-5" },
  async ({ page }) => {
    await page.goto("/login");

    const main = page.getByRole("main");
    await expect(main.getByText(notice)).toBeVisible();
    await expect(main.getByRole("button", { name: "デモ作者として始める" })).toBeVisible();
    await expect(main.getByRole("button", { name: "デモ読者として始める" })).toBeVisible();
    await expect(page.locator("main input, main textarea, main form")).toHaveCount(0);
    await expect(page.getByLabel(/メールアドレス|パスワード/)).toHaveCount(0);
  },
);

test("the demo reader button on the login page logs in", { tag: "@AC-F1-5" }, async ({ page }) => {
  await page.goto("/login");
  expect(await currentUserStatus(page)).toBe(401);

  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();

  await expect(page.getByRole("banner").getByTestId("current-user")).toContainText("デモ読者");
  await expect(page.getByRole("banner").getByRole("link", { name: "ログイン" })).toHaveCount(0);
  expect(await currentUserStatus(page)).toBe(200);
});

// デモ作者の移動先は #124 で執筆の画面に変わるので、ログインが要る API で確かめる
test("the demo author button on the login page logs in", { tag: "@AC-F1-5" }, async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();

  await expect.poll(() => currentUserStatus(page)).toBe(200);
  const user = await page.request.get("/api/user", { headers: { Accept: "application/json" } });
  expect((await user.json()).name).toMatch(/^デモ作者/);
});

test("a guest opening the workspace is led to the login page", { tag: "@AC-F1-2" }, async ({ page }) => {
  await page.goto("/my");

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("main").getByText(notice)).toBeVisible();
  await expect(page.getByRole("heading", { name: "ワークスペース" })).toHaveCount(0);
});

test("a logged-in user can open the workspace", { tag: "@AC-F1-2" }, async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  await expect(page.getByRole("banner").getByTestId("current-user")).toBeVisible();

  await page.goto("/my");

  await expect(page).toHaveURL("/my");
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "ワークスペース" })).toBeVisible();
});

test("two demo users have names that tell them apart", { tag: "@AC-F2-3" }, async ({ page, browser, baseURL }) => {
  const other = await newClient(browser, baseURL, uniqueClientAddress());
  const otherPage = await other.newPage();
  const names: string[] = [];

  for (const current of [page, otherPage]) {
    await current.goto("/");
    await current.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
    const name = current.getByRole("banner").getByTestId("current-user");
    await expect(name).toContainText("デモ読者");
    names.push((await name.textContent()) ?? "");
  }
  await other.close();

  expect(names[0]).not.toBe(names[1]);
  for (const name of names) {
    expect(name).toMatch(/^デモ読者\S*\s*\S+/);
  }
});
