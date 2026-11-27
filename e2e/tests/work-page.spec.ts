import type { Page } from "@playwright/test";
import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

async function startAsDemoAuthor(page: Page) {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
  const [, workId, draftId] = new URL(page.url()).pathname.match(/\/works\/(\d+)\/episodes\/(\d+)\/edit$/) ?? [];
  return { workId, draftId };
}

test("a guest sees work details and a table of contents containing only published episodes", { tag: "@AC-F6-1" }, async ({ page, browser, baseURL }) => {
  const { workId } = await startAsDemoAuthor(page);
  const currentUser = page.getByTestId("current-user");
  await expect(currentUser).toContainText(/デモ作者\s*#\d+/);
  const authorName = (await currentUser.innerText()).replace(/^ログイン中:\s*/, "");

  await page.goto(`/my/works/${workId}/edit`);
  const settings = page.getByRole("form", { name: "小説の設定" });
  await settings.getByText("完結済", { exact: true }).click();
  await settings.getByText("ミステリー", { exact: true }).click();
  await page.getByLabel("キャッチコピー").fill("潮の向こうから届く便り");
  await page.getByLabel("紹介文").fill("岬にある灯台の手帖をめぐる話。");
  await settings.getByText("残酷描写有り", { exact: true }).click();
  await settings.getByText("暴力描写有り", { exact: true }).click();
  await settings.getByText("性描写有り", { exact: true }).click();
  await page.getByLabel("タグ1").fill("灯台");
  await page.getByLabel("タグ2").fill("海辺");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(`/my/works/${workId}`);

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const reader = await guest.newPage();
  await reader.goto(`/works/${workId}`);
  const main = reader.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "灯台守の手帖" })).toBeVisible();
  for (const text of [
    authorName, "潮の向こうから届く便り", "岬にある灯台の手帖をめぐる話。", "ミステリー",
    "完結済", "灯台", "海辺", "残酷描写有り", "暴力描写有り", "性描写有り",
  ]) {
    await expect(main.getByText(text, { exact: true })).toBeVisible();
  }
  const contents = main.getByRole("navigation", { name: "目次" });
  await expect(contents.getByRole("link")).toHaveText(["第1話 岬の灯台"]);
  await contents.getByRole("link", { name: "第1話 岬の灯台" }).click();
  await expect(reader).toHaveURL(new RegExp(`/works/${workId}/episodes/\\d+$`));
  await expect(reader.getByRole("heading", { level: 1, name: "第1話 岬の灯台" })).toBeVisible();
  await guest.close();
});

test("missing works and episodes and works without published episodes show not found", { tag: "@AC-F6-4" }, async ({ page, browser, baseURL }) => {
  const { workId } = await startAsDemoAuthor(page);
  await page.goto("/my/works/new");
  await page.getByLabel("小説タイトル").fill("まだ公開していない作品");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+$/);
  const unpublished = new URL(page.url()).pathname.replace(/^\/my/, "");

  await page.goto(unpublished);
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const guestPage = await guest.newPage();
  for (const path of [unpublished, "/works/0", `/works/${workId}/episodes/0`]) {
    await guestPage.goto(path);
    await expect(guestPage.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  }
  await guest.close();

  const other = await newClient(browser, baseURL, uniqueClientAddress());
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await otherPage.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  await expect(otherPage.getByTestId("current-user")).toContainText("デモ読者");
  await otherPage.goto(unpublished);
  await expect(otherPage.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  await other.close();
});

test("only the workspace shows the owner a draft, and no reader sees it", { tag: "@AC-F4-3" }, async ({ page, browser, baseURL }) => {
  const { workId, draftId } = await startAsDemoAuthor(page);
  await expect(page.getByLabel("本文")).not.toHaveValue("");
  const draftPath = `/works/${workId}/episodes/${draftId}`;

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const guestPage = await guest.newPage();
  const other = await newClient(browser, baseURL, uniqueClientAddress());
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await otherPage.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  await expect(otherPage.getByTestId("current-user")).toContainText("デモ読者");

  for (const reader of [page, guestPage, otherPage]) {
    await reader.goto(draftPath);
    await expect(reader.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
    await expect(reader.getByText("第2話 最初の便り")).toHaveCount(0);
  }
  await guest.close();
  await other.close();
});
