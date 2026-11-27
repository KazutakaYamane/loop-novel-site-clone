import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

async function startAsDemoAuthor(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
}

// 新しい作品に話を 1 つ書いて公開し、作品の ID を返す
async function publishNewWork(page: Page, title: string): Promise<string> {
  await page.goto("/my/works/new");
  await page.getByLabel("小説タイトル").fill(title);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+$/);
  const workId = page.url().split("/").pop() ?? "";
  await page.getByTestId("episode-list").getByRole("link", { name: "エピソードを作成" }).click();
  await page.getByLabel("エピソードタイトル").fill("第1話");
  await page.getByLabel("本文").fill("本文の一行目。");
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/my/works/${workId}/episodes/\\d+/edit$`));
  await page.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(`/my/works/${workId}`);
  return workId;
}

// 並列のテストの作品も同じ時刻に新着へ入るので、先頭や件数ではなく、このテストの 2 つの作品の前後で確かめる
test("the top lists works by the time an episode was last published, newest first", { tag: "@AC-F7-1" }, async ({ page, browser, baseURL }) => {
  await startAsDemoAuthor(page);
  const suffix = randomUUID().slice(0, 8);
  const earlier = `先に公開した小説 ${suffix}`;
  const later = `後に公開した小説 ${suffix}`;
  await publishNewWork(page, earlier);
  await publishNewWork(page, later);

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const guestPage = await guest.newPage();
  await guestPage.goto("/");
  const titles = guestPage.getByTestId("new-arrivals").getByRole("heading", { level: 3 });
  await expect(titles.filter({ hasText: suffix })).toHaveText([later, earlier]);
  await guest.close();
});

test("choosing a work in the new arrivals opens its work page", { tag: "@AC-F7-2" }, async ({ page, browser, baseURL }) => {
  await startAsDemoAuthor(page);
  const title = `新着から開く小説 ${randomUUID().slice(0, 8)}`;
  const workId = await publishNewWork(page, title);

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const guestPage = await guest.newPage();
  await guestPage.goto("/");
  await guestPage.getByTestId("new-arrivals").getByRole("link", { name: title }).click();
  await expect(guestPage).toHaveURL(`/works/${workId}`);
  await expect(guestPage.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await guest.close();
});

test("the mobile footer has a whole-pixel height when its notice wraps", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText("© ヨミカキ")).toBeVisible();
  const height = await footer.evaluate((element) => element.getBoundingClientRect().height);
  expect(height % 1, `mobile footer height: ${height}px`).toBe(0);
});
