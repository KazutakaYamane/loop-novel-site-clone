import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

const notFound = "お探しのページは見つかりませんでした";

async function startAsDemoAuthor(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
}

// 新しい作品に下書きを 1 つ保存し、作品と話の ID を返す
async function createWorkWithDraft(page: Page, title: string, episodeTitle: string) {
  await page.goto("/my/works/new");
  await page.getByLabel("小説タイトル").fill(title);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+$/);
  const workId = page.url().split("/").pop() ?? "";
  await page.getByTestId("episode-list").getByRole("link", { name: "エピソードを作成" }).click();
  await page.getByLabel("エピソードタイトル").fill(episodeTitle);
  await page.getByLabel("本文").fill("灯台の下で書いた本文。");
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/my/works/${workId}/episodes/\\d+/edit$`));
  const episodeId = page.url().split("/").at(-2) ?? "";
  return { workId, episodeId };
}

test("a work without a published episode is hidden from guests on the top and its work page", { tag: "@AC-F3-5" }, async ({ page, browser, baseURL }) => {
  await startAsDemoAuthor(page);
  const title = `下書きだけの小説 ${randomUUID().slice(0, 8)}`;
  const { workId, episodeId } = await createWorkWithDraft(page, title, "まだ書きかけの話");

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const guestPage = await guest.newPage();
  await guestPage.goto("/");
  const newArrivals = guestPage.getByTestId("new-arrivals");
  await expect(newArrivals.getByRole("heading", { level: 2, name: "新着小説" })).toBeVisible();
  await expect(newArrivals.getByText(title)).toHaveCount(0);
  for (const path of [`/works/${workId}`, `/works/${workId}/episodes/${episodeId}`]) {
    await guestPage.goto(path);
    await expect(guestPage.getByRole("heading", { name: notFound })).toBeVisible();
    await expect(guestPage.getByText(title)).toHaveCount(0);
  }
  await guest.close();
});

test("publishing the first episode shows the work and the episode to guests right away", { tag: ["@AC-F4-4", "@AC-F4-5"] }, async ({ page, browser, baseURL }) => {
  await startAsDemoAuthor(page);
  const title = `初めて公開する小説 ${randomUUID().slice(0, 8)}`;
  const { workId, episodeId } = await createWorkWithDraft(page, title, "第1話 灯台の朝");

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const guestPage = await guest.newPage();
  await guestPage.goto(`/works/${workId}`);
  await expect(guestPage.getByRole("heading", { name: notFound })).toBeVisible();

  await page.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(`/my/works/${workId}`);

  await guestPage.goto("/");
  const card = guestPage.getByTestId("new-arrival-work").filter({
    has: guestPage.getByRole("link", { name: title, exact: true }),
  });
  await expect(card.getByRole("link", { name: title, exact: true })).toBeVisible();
  await expect(card.getByText("第1話 灯台の朝", { exact: true })).toBeVisible();
  await guestPage.goto(`/works/${workId}`);
  await expect(guestPage.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(guestPage.getByRole("navigation", { name: "目次" }).getByRole("link")).toHaveText(["第1話 灯台の朝"]);
  await guestPage.goto(`/works/${workId}/episodes/${episodeId}`);
  await expect(guestPage.getByRole("heading", { level: 1, name: "第1話 灯台の朝" })).toBeVisible();
  await expect(guestPage.getByText("灯台の下で書いた本文。")).toBeVisible();
  await guest.close();
});

test("publishing a later draft shows it to guests in new arrivals and on the work and episode pages right away", { tag: "@AC-F4-4" }, async ({ page, browser, baseURL }) => {
  // デモ作者の初期の作品は、公開済みの第1話と下書きの第2話を持って始まる(AC-F2-5)
  await startAsDemoAuthor(page);
  const [, workId, draftId] = new URL(page.url()).pathname.match(/\/works\/(\d+)\/episodes\/(\d+)\/edit$/) ?? [];

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const guestPage = await guest.newPage();
  const workLink = guestPage.locator(`a[href="/works/${workId}"]`);
  const card = guestPage.getByTestId("new-arrival-work").filter({ has: workLink });
  await guestPage.goto("/");
  await expect(card.getByText("第1話 岬の灯台", { exact: true })).toBeVisible();
  await expect(card.getByText("第2話 最初の便り", { exact: true })).toHaveCount(0);

  await guestPage.goto(`/works/${workId}`);
  await expect(guestPage.getByRole("navigation", { name: "目次" }).getByRole("link")).toHaveText(["第1話 岬の灯台"]);

  await page.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(`/my/works/${workId}`);

  await guestPage.goto("/");
  await expect(card.locator(workLink)).toBeVisible();
  await expect(card.getByText("第2話 最初の便り", { exact: true })).toBeVisible();
  await expect(card.getByText("第1話 岬の灯台", { exact: true })).toHaveCount(0);
  await guestPage.goto(`/works/${workId}`);
  await expect(guestPage.getByRole("navigation", { name: "目次" }).getByRole("link")).toHaveText(["第1話 岬の灯台", "第2話 最初の便り"]);
  await guestPage.goto(`/works/${workId}/episodes/${draftId}`);
  await expect(guestPage.getByRole("heading", { level: 1, name: "第2話 最初の便り" })).toBeVisible();
  await guest.close();
});
