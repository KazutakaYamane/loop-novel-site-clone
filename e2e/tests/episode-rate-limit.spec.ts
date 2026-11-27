import type { Page } from "@playwright/test";
import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

// 話の作成・編集の送信は、利用者ごとに 10 分間 30 回まで(docs/adr/0023)
const LIMIT = 30;
const NOTICE = "エピソードを保存できる回数の上限に達しました。10分ほどおいてからもう一度お試しください。";

// デモ作者は初期の作品の下書きの執筆の画面から始まる(AC-F2-5)
async function startAsDemoAuthor(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
}

// Next.js のページ遷移の読み上げも role="alert" を持つので、執筆のフォームの中だけを見る
function editor(page: Page) {
  return page.getByRole("form", { name: "エピソードの執筆" });
}

// 下書き保存を押し、Laravel の応答を待ってその状態を返す。保存済みの文言は押す前から出ているので、文言では待てない
async function saveDraft(page: Page, title: string): Promise<number> {
  await page.getByLabel("エピソードタイトル").fill(title);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/api/my/works/")),
    page.getByRole("button", { name: "下書き保存" }).click(),
  ]);
  return response.status();
}

test(
  "an author who reaches the submission limit is told so, while another author can still save",
  { tag: "@AC-F4-9" },
  async ({ page, browser, baseURL }) => {
    await startAsDemoAuthor(page);
    for (let i = 1; i <= LIMIT; i++) {
      expect(await saveDraft(page, `保存 ${i} 回目`)).toBe(200);
    }
    await expect(page.getByRole("status")).toHaveText("下書きを保存しました。");
    await expect(editor(page).getByRole("alert")).toHaveCount(0);

    expect(await saveDraft(page, "上限を超えた保存")).toBe(429);
    await expect(editor(page).getByRole("alert")).toHaveText(NOTICE);
    await expect(page.getByRole("status")).toHaveText("");

    await page.getByRole("button", { name: "公開する" }).click();
    await expect(editor(page).getByRole("alert")).toHaveText(NOTICE);
    await expect(page).toHaveURL(/\/episodes\/\d+\/edit$/);

    await page.reload();
    await expect(page.getByLabel("エピソードタイトル")).toHaveValue(`保存 ${LIMIT} 回目`);

    // 別の利用者は、同じときに保存できる
    const other = await newClient(browser, baseURL, uniqueClientAddress());
    const otherPage = await other.newPage();
    await startAsDemoAuthor(otherPage);
    expect(await saveDraft(otherPage, "別の作者の保存")).toBe(200);
    await expect(otherPage.getByRole("status")).toHaveText("下書きを保存しました。");
    await expect(editor(otherPage).getByRole("alert")).toHaveCount(0);
    await other.close();
  },
);
