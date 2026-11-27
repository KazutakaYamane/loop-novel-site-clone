import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

test("an expired demo session shows how to restart and cannot reopen the workspace",
  { tag: "@AC-F9-4" },
  async ({ browser, baseURL, page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
    await expect(header.getByTestId("current-user")).toBeVisible();

    const expired = await newClient(browser, baseURL, uniqueClientAddress());
    try {
      await expired.addCookies(await page.context().cookies());
      await header.getByRole("button", { name: "ログアウト" }).click();
      await expect(header.getByRole("link", { name: "ログイン" })).toBeVisible();
      await expect(page.getByRole("link", { name: "デモを始め直す" })).toHaveCount(0);

      const staleTab = await expired.newPage();
      await staleTab.goto("/my");
      await expect(staleTab).toHaveURL("/login");
      await expect(staleTab.getByRole("link", { name: "デモを始め直す" })).toBeVisible();
      await expect(staleTab.getByRole("banner").getByTestId("current-user")).toHaveCount(0);
      await staleTab.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
      await expect(staleTab.getByRole("banner").getByTestId("current-user")).toBeVisible();
      await expect(staleTab.getByRole("link", { name: "デモを始め直す" })).toHaveCount(0);
    } finally {
      await expired.close();
    }
  },
);

test("submitting from a workspace tab after its demo session expires shows the restart notice",
  { tag: "@AC-F9-4" },
  async ({ browser, baseURL, page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
    await expect(header.getByTestId("current-user")).toBeVisible();

    const expired = await newClient(browser, baseURL, uniqueClientAddress());
    try {
      await expired.addCookies(await page.context().cookies());
      const staleTab = await expired.newPage();
      await staleTab.goto(page.url());
      await expect(staleTab.getByRole("button", { name: "下書き保存" })).toBeVisible();

      await header.getByRole("button", { name: "ログアウト" }).click();
      await expect(header.getByRole("link", { name: "ログイン" })).toBeVisible();

      await staleTab.getByRole("button", { name: "下書き保存" }).click();
      await expect(staleTab).toHaveURL("/login");
      await expect(staleTab.getByRole("link", { name: "デモを始め直す" })).toBeVisible();
    } finally {
      await expired.close();
    }
  },
);

test("following a site link after the demo session expires refreshes the shared header",
  { tag: "@AC-F9-4" },
  async ({ browser, baseURL, page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
    await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
    await expect(header.getByTestId("current-user")).toBeVisible();

    const logoutBrowser = await newClient(browser, baseURL, uniqueClientAddress());
    try {
      await logoutBrowser.addCookies(await page.context().cookies());
      const logoutTab = await logoutBrowser.newPage();
      await logoutTab.goto("/");
      await logoutTab.getByRole("banner").getByRole("button", { name: "ログアウト" }).click();
      await expect(logoutTab.getByRole("banner").getByRole("link", { name: "ログイン" })).toBeVisible();

      await header.getByRole("link", { name: "ヨミカキ" }).click();
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("link", { name: "デモを始め直す" })).toBeVisible();
      await expect(header.getByTestId("current-user")).toHaveCount(0);
    } finally {
      await logoutBrowser.close();
    }
  },
);
