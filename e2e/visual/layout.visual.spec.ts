import { expect, test } from "@playwright/test";

// 基準画像は、この issue で確定する要素(ロゴ・ヘッダーの枠・フッター)だけを要素単位で撮る。
// ヘッダーの右側の操作の領域は後の issue が中身を足すので隠す(docs/adr/0013)
test("the site header", async ({ page }) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("img", { name: "ヨミカキ" })).toBeVisible();

  await expect(header).toHaveScreenshot("header.png", { mask: [header.getByTestId("header-actions")] });
});

test("the site footer", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByText("© ヨミカキ")).toBeVisible();

  await expect(footer).toHaveScreenshot("footer.png");
});
