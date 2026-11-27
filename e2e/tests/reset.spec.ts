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

test("a tab opened before login shows the restart notice on navigation after expiry",
  { tag: "@AC-F9-4" },
  async ({ page, browser, baseURL }) => {
    await page.goto("/");
    const otherTab = await page.context().newPage();
    await otherTab.goto("/");
    await otherTab.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
    await expect(otherTab.getByRole("banner").getByTestId("current-user")).toBeVisible();

    const logoutBrowser = await newClient(browser, baseURL, uniqueClientAddress());
    try {
      await logoutBrowser.addCookies(await otherTab.context().cookies());
      const logoutTab = await logoutBrowser.newPage();
      await logoutTab.goto("/");
      await logoutTab.getByRole("banner").getByRole("button", { name: "ログアウト" }).click();
      await expect(logoutTab.getByRole("banner").getByRole("link", { name: "ログイン" })).toBeVisible();

      await page.getByRole("banner").getByRole("link", { name: "ログイン" }).click();
      await expect(page).toHaveURL("/login");
      await expect(page.getByRole("link", { name: "デモを始め直す" })).toBeVisible();
    } finally {
      await logoutBrowser.close();
    }
  },
);

test("a tab showing the expiry notice recognizes a demo restarted in another tab on navigation",
  { tag: "@AC-F9-4" },
  async ({ page, browser, baseURL }) => {
    await page.goto("/");
    await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
    const header = page.getByRole("banner");
    await expect(header.getByTestId("current-user")).toBeVisible();

    const expired = await newClient(browser, baseURL, uniqueClientAddress());
    try {
      await expired.addCookies(await page.context().cookies());
      await header.getByRole("button", { name: "ログアウト" }).click();
      await expect(header.getByRole("link", { name: "ログイン" })).toBeVisible();

      const readingTab = await expired.newPage();
      await readingTab.goto("/");
      const restartNotice = readingTab.getByRole("link", { name: "デモを始め直す" });
      await expect(restartNotice).toBeVisible();

      const restartTab = await expired.newPage();
      await restartTab.goto("/login");
      await restartTab.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
      const currentUser = restartTab.getByTestId("current-user");
      await expect(currentUser).toBeVisible();

      await restartNotice.click();
      await expect(readingTab).toHaveURL("/login");
      await expect(restartNotice).toHaveCount(0);
      await expect(readingTab.getByTestId("current-user")).toHaveText(await currentUser.innerText());
    } finally {
      await expired.close();
    }
  },
);
