import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

// 作品を作る利用者はデモ読者にする。デモ作者は初期の作品を持って始まるので(AC-F2-5、#124)、一覧の中身が変わる
async function startAsDemoReader(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  await expect(page.getByRole("banner").getByTestId("current-user")).toContainText("デモ読者");
}

// 作品を作り、作った作品の画面の URL から ID を返す
async function createWork(page: Page, title: string, introduction: string): Promise<string> {
  await page.goto("/my");
  await page.getByRole("main").getByRole("link", { name: "新しい小説を作成" }).click();
  await expect(page).toHaveURL("/my/works/new");
  await page.getByLabel("小説タイトル").fill(title);
  await page.getByLabel("紹介文").fill(introduction);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return page.url().split("/").pop() ?? "";
}

function detail(page: Page, term: string) {
  return page.getByTestId("work-details").locator("dt", { hasText: term }).locator("xpath=following-sibling::dd[1]");
}

test("a logged-in user creates a work from a title and an introduction", { tag: "@AC-F3-1" }, async ({ page }) => {
  await startAsDemoReader(page);
  const title = `星を数える旅 ${randomUUID().slice(0, 8)}`;

  const id = await createWork(page, title, "夜空の星を数えて旅をする話。");

  await expect(detail(page, "紹介文")).toHaveText("夜空の星を数えて旅をする話。");
  await expect(detail(page, "連載状態")).toHaveText("連載中");
  await page.goto("/my");
  await expect(page.getByTestId("my-works").getByRole("link", { name: title })).toHaveAttribute("href", `/my/works/${id}`);
});

test("the owner changes every setting and sees them on the work", { tag: "@AC-F3-2" }, async ({ page }) => {
  await startAsDemoReader(page);
  const id = await createWork(page, `設定する作品 ${randomUUID().slice(0, 8)}`, "最初の紹介文");
  const title = `変更後のタイトル ${randomUUID().slice(0, 8)}`;

  const settings = page.getByRole("form", { name: "小説の設定" });
  await page.getByRole("link", { name: "小説の設定を編集" }).click();
  await expect(page).toHaveURL(`/my/works/${id}/edit`);
  await settings.getByText("完結済", { exact: true }).click();
  await page.getByLabel("小説タイトル").fill(title);
  await settings.getByText("ミステリー", { exact: true }).click();
  await page.getByLabel("キャッチコピー").fill("心に残る一行");
  await page.getByLabel("紹介文").fill("変更後の紹介文");
  await settings.getByText("残酷描写有り", { exact: true }).click();
  await settings.getByText("性描写有り", { exact: true }).click();
  await page.getByLabel("タグ1").fill("探偵");
  await page.getByLabel("タグ2").fill("学園");
  await page.getByRole("button", { name: "変更を保存" }).click();

  await expect(page).toHaveURL(`/my/works/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(detail(page, "連載状態")).toHaveText("完結済");
  await expect(detail(page, "ジャンル")).toHaveText("ミステリー");
  await expect(detail(page, "キャッチコピー")).toHaveText("心に残る一行");
  await expect(detail(page, "紹介文")).toHaveText("変更後の紹介文");
  await expect(detail(page, "セルフレイティング").getByRole("listitem")).toHaveText(["残酷描写有り", "性描写有り"]);
  await expect(detail(page, "タグ").getByRole("listitem")).toHaveText(["探偵", "学園"]);

  await page.getByRole("link", { name: "小説の設定を編集" }).click();
  await expect(page).toHaveURL(`/my/works/${id}/edit`);
  await expect(page.getByLabel("小説タイトル")).toHaveValue(title);
  await expect(page.getByRole("radio", { name: "完結済" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "ミステリー" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "暴力描写有り" })).not.toBeChecked();

  await settings.getByText("連載中", { exact: true }).click();
  await settings.getByText("残酷描写有り", { exact: true }).click();
  await page.getByLabel("タグ1").fill("");
  await page.getByRole("button", { name: "変更を保存" }).click();

  await expect(page).toHaveURL(`/my/works/${id}`);
  await expect(detail(page, "連載状態")).toHaveText("連載中");
  await expect(detail(page, "セルフレイティング").getByRole("listitem")).toHaveText(["性描写有り"]);
  await expect(detail(page, "タグ").getByRole("listitem")).toHaveText(["学園"]);
});

test("the genres and limits follow kakuyomu and input over a limit is rejected", { tag: "@AC-F3-3" }, async ({ page }) => {
  await startAsDemoReader(page);
  const original = `上限を確かめる作品 ${randomUUID().slice(0, 8)}`;
  const id = await createWork(page, original, "紹介文");
  await page.goto(`/my/works/${id}/edit`);

  await expect(page.getByRole("group", { name: "ジャンル" }).getByRole("radio")).toHaveCount(12);
  await expect(page.getByRole("group", { name: "ジャンル" }).locator("label")).toHaveText([
    "異世界ファンタジー",
    "現代ファンタジー",
    "SF",
    "恋愛",
    "ラブコメ",
    "現代ドラマ",
    "ホラー",
    "ミステリー",
    "エッセイ・ノンフィクション",
    "歴史・時代・伝奇",
    "創作論・評論",
    "詩・童話・その他",
  ]);
  await expect(page.getByRole("group", { name: "タグ" }).getByRole("textbox")).toHaveCount(8);

  await page.getByLabel("キャッチコピー").fill("あ".repeat(35));
  await expect(page.getByText("残り0文字")).toBeVisible();
  await page.getByLabel("キャッチコピー").fill("あ".repeat(36));
  await expect(page.getByText("残り-1文字")).toBeVisible();
  await page.getByLabel("小説タイトル").fill("い".repeat(101));
  await page.getByLabel("タグ1").fill("う".repeat(21));
  await page.getByRole("button", { name: "変更を保存" }).click();

  await expect(page.getByText("小説タイトルは100文字以内で入力してください。")).toBeVisible();
  await expect(page.getByText("キャッチコピーは35文字以内で入力してください。")).toBeVisible();
  await expect(page.getByText("タグは1つ20文字以内で入力してください。")).toBeVisible();
  await expect(page).toHaveURL(`/my/works/${id}/edit`);

  await page.goto(`/my/works/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: original })).toBeVisible();
  await expect(detail(page, "キャッチコピー")).toHaveText("未設定");
});

test("another user can neither open nor change my work", { tag: "@AC-F3-4" }, async ({ page, browser, baseURL }) => {
  await startAsDemoReader(page);
  const title = `持ち主の作品 ${randomUUID().slice(0, 8)}`;
  const id = await createWork(page, title, "持ち主の紹介文");

  const other = await newClient(browser, baseURL, uniqueClientAddress());
  const otherPage = await other.newPage();
  await startAsDemoReader(otherPage);

  await otherPage.goto(`/my/works/${id}/edit`);
  await expect(otherPage.getByRole("heading", { level: 1, name: "この小説は編集できません。" })).toBeVisible();
  await expect(otherPage.getByLabel("小説タイトル")).toHaveCount(0);
  await expect(otherPage.getByText(title)).toHaveCount(0);
  await otherPage.goto(`/my/works/${id}`);
  await expect(otherPage.getByRole("heading", { level: 1, name: "この小説は編集できません。" })).toBeVisible();
  await expect(otherPage.getByText("持ち主の紹介文")).toHaveCount(0);
  await otherPage.goto("/my");
  await expect(otherPage.getByTestId("my-works").getByRole("link", { name: title })).toHaveCount(0);

  // 画面を通さずに、他の利用者のセッションと CSRF トークンで直接送っても拒否される
  const token = (await (await otherPage.request.get("/api/csrf-token", { headers: { Accept: "application/json" } })).json()).token;
  const sent = await otherPage.request.put(`/api/my/works/${id}`, {
    headers: { Accept: "application/json", "X-CSRF-TOKEN": token },
    data: {
      title: "書き換えられたタイトル",
      catchphrase: null,
      introduction: "書き換え",
      genre: null,
      tags: [],
      rating_cruel: false,
      rating_violent: false,
      rating_sexual: false,
      serial_status: "completed",
    },
  });
  expect(sent.status()).toBe(403);
  await other.close();

  await page.goto(`/my/works/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(detail(page, "紹介文")).toHaveText("持ち主の紹介文");
  await expect(detail(page, "連載状態")).toHaveText("連載中");
});
