import { randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

// 作品を作る利用者はデモ読者にする。デモ作者は初期の作品を持って始まるので(AC-F2-5)、作品の数が人によって変わる
async function startAsDemoReader(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ読者として始める" }).click();
  await expect(page.getByRole("banner").getByTestId("current-user")).toContainText("デモ読者");
}

async function createWork(page: Page): Promise<string> {
  const title = `話を書く小説 ${randomUUID().slice(0, 8)}`;
  await page.goto("/my/works/new");
  await page.getByLabel("小説タイトル").fill(title);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return page.url().split("/").pop() ?? "";
}

// 作品の画面から新しい話を下書きとして保存し、開いた執筆の画面の URL から話の ID を返す
async function saveNewDraft(page: Page, workId: string, title: string, body: string): Promise<string> {
  await page.goto(`/my/works/${workId}`);
  await page.getByTestId("episode-list").getByRole("link", { name: "エピソードを作成" }).click();
  await expect(page).toHaveURL(`/my/works/${workId}/episodes/new`);
  await page.getByLabel("エピソードタイトル").fill(title);
  await page.getByLabel("本文").fill(body);
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/my/works/${workId}/episodes/\\d+/edit$`));
  return page.url().split("/").at(-2) ?? "";
}

function episodeRows(page: Page) {
  return page.getByRole("list", { name: "エピソード" }).getByRole("listitem");
}

test("the owner writes an episode and saves it as a draft", { tag: "@AC-F4-1" }, async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);

  const episodeId = await saveNewDraft(page, workId, "第1話 はじまり", "　一行目の段落。\n\n　二行目の段落。");

  await expect(page.getByRole("heading", { level: 1, name: "第1話 はじまり" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("エピソードタイトル")).toHaveValue("第1話 はじまり");
  await expect(page.getByLabel("本文")).toHaveValue("　一行目の段落。\n\n　二行目の段落。");
  await page.goto(`/my/works/${workId}`);
  await expect(episodeRows(page)).toHaveCount(1);
  await expect(episodeRows(page).first()).toContainText("下書き");
  await expect(episodeRows(page).first().getByRole("link", { name: "第1話 はじまり" })).toHaveAttribute(
    "href",
    `/my/works/${workId}/episodes/${episodeId}/edit`,
  );
});

test("the owner edits a draft and saves it again and again", { tag: "@AC-F4-2" }, async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);
  const episodeId = await saveNewDraft(page, workId, "書きかけ", "最初の本文");

  for (const round of ["二回目", "三回目"]) {
    await page.getByLabel("エピソードタイトル").fill(`${round}のタイトル`);
    await page.getByLabel("本文").fill(`${round}の本文`);
    await page.getByRole("button", { name: "下書き保存" }).click();
    await expect(page.getByRole("status")).toHaveText("下書きを保存しました。");
    await page.reload();
    await expect(page.getByLabel("エピソードタイトル")).toHaveValue(`${round}のタイトル`);
    await expect(page.getByLabel("本文")).toHaveValue(`${round}の本文`);
  }

  await page.goto(`/my/works/${workId}`);
  await episodeRows(page).getByRole("link", { name: "三回目のタイトル" }).click();
  await expect(page).toHaveURL(`/my/works/${workId}/episodes/${episodeId}/edit`);
  await expect(page.getByLabel("本文")).toHaveValue("三回目の本文");
});

test("an episode with an empty body cannot be published and the reason is shown", { tag: "@AC-F4-6" }, async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);
  await saveNewDraft(page, workId, "本文はまだ", "");

  await page.getByRole("button", { name: "公開する" }).click();

  await expect(page.getByText("本文が空のエピソードは公開できません。")).toBeVisible();
  await expect(page.getByLabel("本文")).toHaveAttribute("aria-invalid", "true");
  await page.goto(`/my/works/${workId}`);
  await expect(episodeRows(page).first()).toContainText("下書き");
  await expect(episodeRows(page).first()).not.toContainText("公開中");
});

test("the owner publishes a draft with what is written in the editor", { tag: "@AC-F4-6" }, async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);
  const episodeId = await saveNewDraft(page, workId, "公開する話", "");

  await page.getByLabel("本文").fill("書き上げた本文");
  await page.getByRole("button", { name: "公開する" }).click();

  await expect(page).toHaveURL(`/my/works/${workId}`);
  await expect(episodeRows(page).first()).toContainText("公開中");
  await expect(episodeRows(page).first().locator("time")).toBeVisible();
  await page.goto(`/my/works/${workId}/episodes/${episodeId}/edit`);
  await expect(page.getByText("公開済みのエピソードは編集できません。")).toBeVisible();
  await expect(page.getByLabel("本文")).toHaveCount(0);
});

test("episodes are listed in the order they were created", { tag: "@AC-F4-8" }, async ({ page }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);
  await saveNewDraft(page, workId, "一番目に作った話", "本文");
  await saveNewDraft(page, workId, "二番目に作った話", "本文");
  await saveNewDraft(page, workId, "三番目に作った話", "本文");

  // 二番目を公開し、一番目を保存し直しても、並びは作った順のまま
  await page.goto(`/my/works/${workId}`);
  await episodeRows(page).getByRole("link", { name: "二番目に作った話" }).click();
  await page.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(`/my/works/${workId}`);
  await episodeRows(page).getByRole("link", { name: "一番目に作った話" }).click();
  await page.getByLabel("本文").fill("保存し直した本文");
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(page.getByRole("status")).toHaveText("下書きを保存しました。");

  await page.goto(`/my/works/${workId}`);
  await expect(episodeRows(page).getByRole("link")).toHaveText(["一番目に作った話", "二番目に作った話", "三番目に作った話"]);
  await expect(episodeRows(page).nth(1)).toContainText("公開中");
});

async function csrfToken(request: APIRequestContext): Promise<string> {
  const response = await request.get("/api/csrf-token", { headers: { Accept: "application/json" } });
  return (await response.json()).token;
}

test(
  "another user can neither create, edit, nor publish an episode of my work",
  { tag: "@AC-F4-7" },
  async ({ page, browser, baseURL }) => {
    await startAsDemoReader(page);
    const workId = await createWork(page);
    const episodeId = await saveNewDraft(page, workId, "持ち主の下書き", "持ち主の本文");

    const other = await newClient(browser, baseURL, uniqueClientAddress());
    const otherPage = await other.newPage();
    await startAsDemoReader(otherPage);

    // 画面では、執筆の画面も話の一覧も出ない
    for (const path of [`/my/works/${workId}/episodes/new`, `/my/works/${workId}/episodes/${episodeId}/edit`, `/my/works/${workId}`]) {
      await otherPage.goto(path);
      await expect(otherPage.getByRole("heading", { level: 1, name: "この小説は編集できません。" })).toBeVisible();
      await expect(otherPage.getByLabel("本文")).toHaveCount(0);
      await expect(otherPage.getByText("持ち主の下書き")).toHaveCount(0);
    }

    // API を直接呼んでも、作成・編集・公開は拒まれる
    const headers = { Accept: "application/json", "X-CSRF-TOKEN": await csrfToken(otherPage.request) };
    const data = { title: "乗っ取り", body: "乗っ取りの本文" };
    const attempts = [
      otherPage.request.post(`/api/my/works/${workId}/episodes`, { headers, data }),
      otherPage.request.put(`/api/my/works/${workId}/episodes/${episodeId}`, { headers, data }),
      otherPage.request.post(`/api/my/works/${workId}/episodes/${episodeId}/publication`, { headers, data }),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status()).toBe(403);
    }
    await other.close();

    await page.goto(`/my/works/${workId}`);
    await expect(episodeRows(page).getByRole("link")).toHaveText(["持ち主の下書き"]);
    await expect(episodeRows(page).first()).toContainText("下書き");
    await episodeRows(page).getByRole("link", { name: "持ち主の下書き" }).click();
    await expect(page.getByLabel("本文")).toHaveValue("持ち主の本文");
  },
);

test("a guest cannot create an episode through the API", { tag: "@AC-F4-7" }, async ({ page, browser, baseURL }) => {
  await startAsDemoReader(page);
  const workId = await createWork(page);

  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const headers = { Accept: "application/json", "X-CSRF-TOKEN": await csrfToken(guest.request) };
  const response = await guest.request.post(`/api/my/works/${workId}/episodes`, { headers, data: { title: "ゲスト", body: "本文" } });
  expect(response.status()).toBe(401);
  await guest.close();

  await page.goto(`/my/works/${workId}`);
  await expect(page.getByText("エピソードはまだありません。")).toBeVisible();
});
