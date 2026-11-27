import type { Page } from "@playwright/test";
import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

// この issue で確定する要素を要素単位で撮る(docs/adr/0016)。ワークスペースの作品の画面の話の一覧(#124)と
// ヘッダーは撮らない。デモ読者は何も持たない状態で始まるので(AC-F2-6)、一覧の中身は毎回同じになる
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
  await page.getByLabel("紹介文").fill("見た目を確かめるための紹介文です。");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+$/);
  return page.url().split("/").pop() ?? "";
}

test("the empty workspace", async ({ page }) => {
  await startAsDemoReader(page);
  await page.goto("/my");
  const works = page.getByTestId("my-works");
  await expect(works.getByText("まだ小説がありません。")).toBeVisible();

  await expect(works).toHaveScreenshot("workspace-empty.png");
});

test("the workspace with a work", async ({ page }) => {
  await startAsDemoReader(page);
  await createWork(page);
  await page.goto("/my");
  const works = page.getByTestId("my-works");
  await expect(works.getByRole("link", { name: "見た目を確かめる小説" })).toBeVisible();

  await expect(works).toHaveScreenshot("workspace-with-work.png");
});

test("the new work form", async ({ page }) => {
  await startAsDemoReader(page);
  await page.goto("/my/works/new");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "保存" })).toBeVisible();
  await fitHeight(page);

  await expect(main).toHaveScreenshot("new-work-form.png");
});

test("the work settings form", async ({ page }) => {
  await startAsDemoReader(page);
  const id = await createWork(page);
  await page.goto(`/my/works/${id}/edit`);
  const form = page.getByRole("form", { name: "小説の設定" });
  await form.getByText("ミステリー", { exact: true }).click();
  await form.getByText("暴力描写有り", { exact: true }).click();
  await form.getByLabel("キャッチコピー").fill("あ".repeat(36));
  await form.getByLabel("タグ1").fill("探偵");
  await expect(form.getByText("残り-1文字")).toBeVisible();
  await fitHeight(page);

  await expect(form).toHaveScreenshot("work-settings-form.png");
});

test("the settings errors", async ({ page }) => {
  await startAsDemoReader(page);
  const id = await createWork(page);
  await page.goto(`/my/works/${id}/edit`);
  const form = page.getByRole("form", { name: "小説の設定" });
  await form.getByLabel("キャッチコピー").fill("あ".repeat(36));
  await form.getByLabel("タグ1").fill("い".repeat(21));
  await form.getByRole("button", { name: "変更を保存" }).click();
  await expect(form.getByText("タグは1つ20文字以内で入力してください。")).toBeVisible();

  await expect(form.getByRole("group", { name: "タグ" })).toHaveScreenshot("work-settings-tag-error.png");
});

test("the work details", async ({ page }) => {
  await startAsDemoReader(page);
  const id = await createWork(page);
  await page.goto(`/my/works/${id}/edit`);
  const form = page.getByRole("form", { name: "小説の設定" });
  await form.getByText("SF", { exact: true }).click();
  await form.getByText("残酷描写有り", { exact: true }).click();
  await form.getByLabel("キャッチコピー").fill("一行で惹きつける");
  await form.getByLabel("タグ1").fill("宇宙");
  await form.getByLabel("タグ2").fill("旅");
  await form.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(`/my/works/${id}`);
  const details = page.getByTestId("work-details");
  await expect(details.getByText("一行で惹きつける")).toBeVisible();
  await fitHeight(page);

  await expect(details).toHaveScreenshot("work-details.png");
});

test("another user's work", async ({ page, browser, baseURL }) => {
  await startAsDemoReader(page);
  const id = await createWork(page);
  const other = await newClient(browser, baseURL, uniqueClientAddress());
  const otherPage = await other.newPage();
  await startAsDemoReader(otherPage);

  await otherPage.goto(`/my/works/${id}/edit`);
  const main = otherPage.getByRole("main");
  await expect(main.getByRole("heading", { name: "この小説は編集できません。" })).toBeVisible();

  await expect(main).toHaveScreenshot("work-forbidden.png");
  await other.close();
});
