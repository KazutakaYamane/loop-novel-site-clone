import { expect, test } from "@playwright/test";

// #132 がデモログインを IP ごとに 1 時間 10 回までに制限する。
// このファイルのデモログインは 2 回(デモ読者 1 回、デモ作者 1 回)に抑える

test("the top page and the header show both demo buttons to a guest", { tag: "@AC-F2-1" }, async ({ page }) => {
  await page.goto("/");

  for (const area of [page.getByRole("main"), page.getByRole("banner")]) {
    await expect(area.getByRole("button", { name: "デモ作者として始める" })).toBeVisible();
    await expect(area.getByRole("button", { name: "デモ読者として始める" })).toBeVisible();
  }
});

test(
  "the demo reader button creates a user, logs in, and moves to the top page",
  { tag: ["@AC-F2-2", "@AC-F2-6", "@AC-F1-3"] },
  async ({ page }) => {
    // トップ以外のページのヘッダーから始め、トップへ移動することを確かめる
    await page.goto("/no-such-page");
    await expect(page.getByRole("banner").getByRole("button", { name: "デモ読者として始める" })).toBeVisible();
    expect((await page.request.get("/api/user", { headers: { Accept: "application/json" } })).status()).toBe(401);

    await page.getByRole("banner").getByRole("button", { name: "デモ読者として始める" }).click();

    await expect(page).toHaveURL("/");
    const header = page.getByRole("banner");
    await expect(header.getByTestId("current-user")).toBeVisible();
    await expect(header.getByRole("button", { name: /デモ.*として始める/ })).toHaveCount(0);
    expect((await page.request.get("/api/user", { headers: { Accept: "application/json" } })).status()).toBe(200);

    // ログイン状態を表すセッションの cookie は、ブラウザの JavaScript から読めない
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === "yomikaki_session");
    expect(session?.httpOnly).toBe(true);
    const readable = await page.evaluate(() => document.cookie);
    expect(readable).not.toContain("yomikaki_session");
    expect(readable).not.toContain(session?.value ?? "missing");
  },
);

test("the demo author button creates a user and logs in", { tag: "@AC-F2-2" }, async ({ page }) => {
  await page.goto("/");

  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();

  // 移動先は #124 で執筆の画面に変わるので、どのページにもあるヘッダーとログインが要る API で確かめる
  await expect(page.getByRole("banner").getByTestId("current-user")).toBeVisible();
  expect((await page.request.get("/api/user", { headers: { Accept: "application/json" } })).status()).toBe(200);
});

test("an update without the session's CSRF token is rejected and logs nobody in", { tag: "@AC-F1-4" }, async ({ page }) => {
  await page.goto("/");

  const forged = await page.request.post("/api/demo-sessions", {
    headers: { Accept: "application/json", "X-CSRF-TOKEN": "forged", Origin: "https://evil.example" },
    data: { role: "reader" },
  });

  expect(forged.status()).toBe(419);
  expect((await page.request.get("/api/user", { headers: { Accept: "application/json" } })).status()).toBe(401);
});
