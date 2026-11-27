import { expect, test } from "../support/clientAddress";

test(
  "a demo author starts with a work that has a published episode and a draft, on the writing screen",
  { tag: "@AC-F2-5" },
  async ({ page }) => {
    await page.goto("/");

    await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();

    // 執筆の画面(初期の作品の下書きの話)へ移動する
    await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
    await expect(page.getByRole("banner").getByTestId("current-user")).toContainText("デモ作者");
    await expect(page.getByRole("heading", { level: 1, name: "第2話 最初の便り" })).toBeVisible();
    await expect(page.getByLabel("本文")).not.toHaveValue("");
    await expect(page.getByRole("button", { name: "公開する" })).toBeEnabled();

    const workId = page.url().split("/").at(-4);
    await page.getByRole("navigation", { name: "パンくずリスト" }).getByRole("link", { name: "灯台守の手帖" }).click();
    await expect(page).toHaveURL(`/my/works/${workId}`);
    const rows = page.getByRole("list", { name: "エピソード" }).getByRole("listitem");
    await expect(rows.getByRole("link")).toHaveText(["第1話 岬の灯台", "第2話 最初の便り"]);
    await expect(rows.nth(0)).toContainText("公開中");
    await expect(rows.nth(1)).toContainText("下書き");

    // ワークスペースには初期の作品が 1 つだけある
    await page.goto("/my");
    await expect(page.getByTestId("my-works").getByRole("listitem").getByRole("link")).toHaveText(["灯台守の手帖"]);
  },
);
