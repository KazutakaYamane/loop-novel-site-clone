import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

test("the notice for restarting an expired demo", async ({ browser, baseURL, page }) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  await expect(header.getByTestId("current-user")).toBeVisible();

  const logoutBrowser = await newClient(browser, baseURL, uniqueClientAddress());
  try {
    await logoutBrowser.addCookies(await page.context().cookies());
    const logoutTab = await logoutBrowser.newPage();
    await logoutTab.goto("/");
    await logoutTab.getByRole("banner").getByRole("button", { name: "ログアウト" }).click();
    await expect(logoutTab.getByRole("banner").getByRole("link", { name: "ログイン" })).toBeVisible();

    await page.goto("/login");
    const notice = page.getByRole("region", { name: "ログイン状態が解除されました" });
    await expect(notice).toBeVisible();
    await expect(notice).toHaveScreenshot("restart-demo-notice.png");
  } finally {
    await logoutBrowser.close();
  }
});
