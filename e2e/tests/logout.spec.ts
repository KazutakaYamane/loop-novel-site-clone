import { expect, test } from "../support/clientAddress";
import type { Page } from "@playwright/test";

async function currentUser(page: Page): Promise<{ status: number; name?: string }> {
  const response = await page.request.get("/api/user", { headers: { Accept: "application/json" } });
  return { status: response.status(), name: response.ok() ? (await response.json()).name : undefined };
}

async function startAsDemoReader(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  const name = page.getByRole("banner").getByTestId("current-user");
  await expect(name).toContainText("デモ読者");
  return (await name.textContent()) ?? "";
}

test("after logging out, the workspace can no longer be opened", { tag: "@AC-F1-1" }, async ({ page }) => {
  await startAsDemoReader(page);
  await page.goto("/my");
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "ワークスペース" })).toBeVisible();

  await page.getByRole("banner").getByRole("button", { name: "ログアウト" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "ログイン" })).toBeVisible();
  await expect(page.getByRole("banner").getByTestId("current-user")).toHaveCount(0);
  expect((await currentUser(page)).status).toBe(401);

  await page.goto("/my");

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "ワークスペース" })).toHaveCount(0);
});

test("a logout from another site is rejected and keeps the user logged in", { tag: "@AC-F1-1" }, async ({ page }) => {
  await startAsDemoReader(page);

  for (const headers of [{}, { "X-CSRF-TOKEN": "forged" }, { Origin: "https://evil.example" }]) {
    const forged = await page.request.delete("/api/session", { headers: { Accept: "application/json", ...headers } });

    expect(forged.status()).toBe(419);
  }
  expect((await currentUser(page)).status).toBe(200);
  await page.goto("/my");
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "ワークスペース" })).toBeVisible();
});

test("pressing the demo button again after logging out makes a new user", { tag: "@AC-F2-4" }, async ({ page }) => {
  const first = await startAsDemoReader(page);
  await page.getByRole("banner").getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "ログイン" })).toBeVisible();

  const second = await startAsDemoReader(page);

  expect(second).not.toBe(first);
  expect((await currentUser(page)).name).toBe(second);
});

test("pressing the demo button again after the login state is gone makes a new user", { tag: "@AC-F2-4" }, async ({ page, context }) => {
  const first = await startAsDemoReader(page);
  // ログイン状態が切れると、ブラウザにはログイン状態を表す cookie が残らない
  await context.clearCookies();
  expect((await currentUser(page)).status).toBe(401);

  const second = await startAsDemoReader(page);

  expect(second).not.toBe(first);
  expect((await currentUser(page)).name).toBe(second);
});
