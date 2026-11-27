import { expect, test, uniqueClientAddress, newClient } from "../support/clientAddress";

const limitMessage = "デモを始められる回数の上限に達しました。1時間ほどおいてからもう一度お試しください。";

test(
  "demo login works ten times an hour from one IP address and the eleventh shows the limit",
  { tag: "@AC-F2-7" },
  async ({ page, context }) => {
    for (let i = 1; i <= 10; i++) {
      await page.goto("/");
      await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
      await expect(page.getByRole("banner").getByTestId("current-user")).toBeVisible();
      // ログアウトは #122 で作る。cookie を消してゲストに戻り、同じ IP からもう一度押す
      await context.clearCookies();
    }

    await page.goto("/");
    await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(limitMessage);
    expect((await page.request.get("/api/user", { headers: { Accept: "application/json" } })).status()).toBe(401);

    // ヘッダーのボタンでも同じ案内が見える
    await page.reload();
    await page.getByRole("banner").getByRole("button", { name: "デモ読者として始める" }).click();
    await expect(page.getByRole("banner").getByRole("alert")).toHaveText(limitMessage);
    await expect(page.getByRole("banner").getByTestId("current-user")).toHaveCount(0);
  },
);

test(
  "the limit of one IP address does not stop demo login from another IP address",
  { tag: "@AC-F2-7" },
  async ({ page, context, browser, baseURL }) => {
    for (let i = 1; i <= 10; i++) {
      await page.goto("/");
      await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
      await expect(page.getByRole("banner").getByTestId("current-user")).toBeVisible();
      await context.clearCookies();
    }

    const other = await newClient(browser, baseURL, uniqueClientAddress());
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    await otherPage.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
    await expect(otherPage.getByRole("banner").getByTestId("current-user")).toBeVisible();
    await other.close();
  },
);

test(
  "an X-User-IP header sent by the browser does not change the IP address the limit counts",
  { tag: "@AC-F2-7" },
  async ({ page, context, clientAddress }) => {
    for (let i = 1; i <= 10; i++) {
      await context.setExtraHTTPHeaders({ "X-Forwarded-For": clientAddress, "X-User-IP": uniqueClientAddress() });
      await page.goto("/");
      await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
      await expect(page.getByRole("banner").getByTestId("current-user")).toBeVisible();
      await context.clearCookies();
    }

    await context.setExtraHTTPHeaders({ "X-Forwarded-For": clientAddress, "X-User-IP": uniqueClientAddress() });
    await page.goto("/");
    await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(limitMessage);
  },
);
