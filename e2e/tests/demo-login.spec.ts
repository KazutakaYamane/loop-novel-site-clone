import { expect, type Page, test } from "@playwright/test";

// #132 がデモログインを IP ごとに 1 時間 10 回までに制限する。
// このファイルのデモログインは 2 回(デモ読者 1 回、デモ作者 1 回)に抑える

async function currentUserStatus(page: Page): Promise<number> {
  return (await page.request.get("/api/user", { headers: { Accept: "application/json" } })).status();
}

test("the top page shows both demo buttons to a guest", { tag: "@AC-F2-1" }, async ({ page }) => {
  await page.goto("/");

  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "デモ作者として始める" })).toBeVisible();
  await expect(main.getByRole("button", { name: "デモ読者として始める" })).toBeVisible();
});

test(
  "the demo reader button creates a user, logs in, and stays on the top page",
  { tag: ["@AC-F2-2", "@AC-F2-6", "@AC-F1-3"] },
  async ({ page }) => {
    await page.goto("/");
    expect(await currentUserStatus(page)).toBe(401);

    await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();

    await expect.poll(() => currentUserStatus(page)).toBe(200);
    await expect(page).toHaveURL("/");

    // ログイン状態を表すセッションの cookie は、ブラウザの JavaScript から読めない
    const session = (await page.context().cookies()).find((cookie) => cookie.name === "yomikaki_session");
    expect(session?.httpOnly).toBe(true);
    const readable = await page.evaluate(() => document.cookie);
    expect(readable).not.toContain("yomikaki_session");
    expect(readable).not.toContain(session?.value ?? "missing");
  },
);

test("the demo author button creates a user and logs in", { tag: "@AC-F2-2" }, async ({ page }) => {
  await page.goto("/");

  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();

  // 移動先は #124 で執筆の画面に変わるので、ログインが要る API でだけ確かめる
  await expect.poll(() => currentUserStatus(page)).toBe(200);
});

test("an update without the session's CSRF token is rejected and logs nobody in", { tag: "@AC-F1-4" }, async ({ page }) => {
  await page.goto("/");

  const forged = await page.request.post("/api/demo-sessions", {
    headers: { Accept: "application/json", "X-CSRF-TOKEN": "forged", Origin: "https://evil.example" },
    data: { role: "reader" },
  });

  expect(forged.status()).toBe(419);
  expect(await currentUserStatus(page)).toBe(401);
});
