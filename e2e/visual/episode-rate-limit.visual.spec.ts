import { expect, test } from "../support/clientAddress";

// 執筆の画面の、送信回数の上限の案内だけを撮る(docs/adr/0016)。制限は利用者ごとなので(docs/adr/0023)、
// このテストのデモ作者が本物の上限を超えて送っても、並列に動く他のテストには影響しない
test("the submission limit notice on the episode editor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);

  // 上限の 30 回を送り切った次の送信が拒まれる
  for (let i = 0; i <= 30; i++) {
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/api/my/works/")),
      page.getByRole("button", { name: "下書き保存" }).click(),
    ]);
  }
  const notice = page.getByRole("form", { name: "エピソードの執筆" }).getByRole("alert");
  await expect(notice).toBeVisible();

  await expect(notice).toHaveScreenshot("episode-rate-limit-notice.png");
});
