import type { Page } from "@playwright/test";
import { expect, test } from "../support/clientAddress";

// この issue で確定する要素を要素単位で撮る(docs/adr/0016)。ヘッダーは撮らない。
// デモ読者は何も持たない状態で始まるので(AC-F2-6)、自分で作った作品と話だけが写る。公開時刻は実行ごとに変わるので隠す
async function startAsDemoReader(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  await expect(page.getByRole("banner").getByTestId("current-user")).toBeVisible();
}

// 画面より縦に長い要素を撮ると、固定のヘッダーが要素の上に重なって写る。幅は変えずに、要素が収まる高さにする
async function fitHeight(page: Page): Promise<void> {
  const size = page.viewportSize();
  if (size !== null) {
    await page.setViewportSize({ width: size.width, height: 3000 });
  }
}

async function createWork(page: Page): Promise<string> {
  await page.goto("/my/works/new");
  await page.getByLabel("小説タイトル").fill("見た目を確かめる小説");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+$/);
  return page.url().split("/").pop() ?? "";
}

async function saveDraft(page: Page, workId: string, title: string, body: string): Promise<void> {
  await page.goto(`/my/works/${workId}/episodes/new`);
  await page.getByLabel("エピソードタイトル").fill(title);
  await page.getByLabel("本文").fill(body);
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(page).toHaveURL(/\/episodes\/\d+\/edit$/);
}

test("the editor of a new episode", async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);
  await page.goto(`/my/works/${workId}/episodes/new`);
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "下書き保存" })).toBeVisible();
  await fitHeight(page);

  await expect(main).toHaveScreenshot("new-episode-editor.png");
});

test("the editor of a draft with an error", async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);
  await saveDraft(page, workId, "第1話 見た目の確認", "");
  await page.getByRole("button", { name: "公開する" }).click();
  const main = page.getByRole("main");
  await expect(main.getByText("本文が空のエピソードは公開できません。")).toBeVisible();
  await fitHeight(page);

  await expect(main).toHaveScreenshot("draft-episode-editor-error.png");
});

test("the episode list of a work", async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);
  await saveDraft(page, workId, "第1話 公開した話", "公開した本文");
  await page.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(`/my/works/${workId}`);
  await saveDraft(page, workId, "第2話 下書きの話", "下書きの本文");
  await page.goto(`/my/works/${workId}`);
  const list = page.getByTestId("episode-list");
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await expect(list).toHaveScreenshot("episode-list.png", { mask: [list.locator("time")] });
});

test("the episode list of a work without episodes", async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);
  await page.goto(`/my/works/${workId}`);
  const list = page.getByTestId("episode-list");
  await expect(list.getByText("エピソードはまだありません。")).toBeVisible();

  await expect(list).toHaveScreenshot("episode-list-empty.png");
});
