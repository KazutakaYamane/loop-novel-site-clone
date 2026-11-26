import { expect, type Page, test } from "@playwright/test";

// トップとヘッダーに出してはいけない導線(AC-F7-3)
const forbiddenLinkName = /ランキング|検索|小説を探す|ジャンル/;
const forbiddenHref = /ranking|search|explore|genre/;

async function expectNoForbiddenNavigation(page: Page) {
  await expect(page.getByRole("link", { name: forbiddenLinkName })).toHaveCount(0);
  await expect(page.getByRole("search")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  const hrefs = await page.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  for (const href of hrefs) {
    expect(href).not.toMatch(forbiddenHref);
  }
}

test("the top page and header on PC show no ranking, search, or genre navigation", { tag: "@AC-F7-3" }, async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner").getByRole("link", { name: "ヨミカキ" })).toBeVisible();
  await expectNoForbiddenNavigation(page);
});

test.describe("on a smartphone", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  test("the top page and header show no ranking, search, or genre navigation", { tag: "@AC-F7-3" }, async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("navigation", { name: "サイト内の移動" }).getByRole("link", { name: "ホーム" }),
    ).toBeVisible();
    await expectNoForbiddenNavigation(page);
  });
});

test("the top page is named after the clone, not Kakuyomu", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("ヨミカキ");
});

test("every page is noindex", async ({ page }) => {
  for (const path of ["/", "/no-such-page"]) {
    await page.goto(path);

    await expect(page.getByRole("contentinfo")).toBeVisible();
    // 見つからないページには Next.js も noindex の meta を足すので、すべての meta が noindex であることを確かめる
    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute("content")));
    expect(robots.length).toBeGreaterThan(0);
    for (const content of robots) {
      expect(content).toBe("noindex");
    }
  }
});

test("the footer says the site is an unofficial clone", async ({ page }) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText(/カクヨムの非公式のクローンです/)).toBeVisible();
  await expect(footer.getByText("© ヨミカキ")).toBeVisible();
});
