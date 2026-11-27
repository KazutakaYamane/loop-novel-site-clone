import type { Page } from "@playwright/test";
import { expect, test } from "../support/clientAddress";

// backend/database/data/aozora/manifest.json の公開時刻の新しい順
const SEED_TITLES = [
  "恋愛論",
  "夢十夜",
  "杜子春",
  "ある宇宙塵の秘密",
  "蜘蛛の糸",
  "注文の多い料理店",
  "走れメロス",
  "山月記",
  "瓶詰地獄",
  "檸檬",
  "外科室",
  "手袋を買いに",
  "桜の森の満開の下",
  "よだかの星",
  "茶わんの湯",
];

// 他のテストが公開した作品がシードより上に並ぶので、新着をページ送りでたどってシードの作品を集める。
// たどる間に作品が公開されると、ページの境目の作品が次のページにもう一度出るので、最初に出た位置を使う
async function seedWorksInNewArrivals(page: Page): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  await page.goto("/");
  for (let pageNumber = 2; ; pageNumber++) {
    const list = page.getByTestId("new-arrivals");
    await expect(list.getByRole("heading", { level: 2, name: "新着小説" })).toBeVisible();
    const links = await list.getByRole("heading", { level: 3 }).getByRole("link").evaluateAll((elements) =>
      elements.map((link) => [link.textContent ?? "", link.getAttribute("href") ?? ""] as const),
    );
    for (const [title, href] of links) {
      if (SEED_TITLES.includes(title) && !found.has(title)) {
        found.set(title, href);
      }
    }
    const next = page.getByRole("navigation", { name: "ページ送り" }).getByRole("link", { name: "次へ" });
    if (found.size === SEED_TITLES.length || (await next.count()) === 0) {
      return found;
    }
    await next.click();
    await expect(page).toHaveURL(`/new-arrivals?page=${pageNumber}`);
    // URL が変わっても前のページの一覧が残っている間があるので、新しいページの「前へ」の行き先で入れ替わりを待つ
    await expect(page.getByRole("navigation", { name: "ページ送り" }).getByRole("link", { name: "前へ" }))
      .toHaveAttribute("href", pageNumber === 2 ? "/" : `/new-arrivals?page=${pageNumber - 1}`);
  }
}

async function openSeedWork(page: Page, title: string): Promise<void> {
  const href = (await seedWorksInNewArrivals(page)).get(title);
  expect(href).toMatch(/^\/works\/\d+$/);
  await page.goto(href ?? "");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test("the new arrivals list the seed works in the order of their publication times", { tag: "@AC-F8-6" }, async ({ page }) => {
  const found = await seedWorksInNewArrivals(page);

  expect([...found.keys()]).toEqual(SEED_TITLES);
});

test("seed works are written by seed users and spread over several genres", { tag: "@AC-F8-1" }, async ({ page }) => {
  await openSeedWork(page, "蜘蛛の糸");
  await expect(page.getByTestId("work-author")).toHaveText("芥川龍之介");
  await expect(page.getByText("詩・童話・その他", { exact: true })).toBeVisible();

  await openSeedWork(page, "山月記");
  await expect(page.getByTestId("work-author")).toHaveText("中島敦");
  await expect(page.getByText("歴史・時代・伝奇", { exact: true })).toBeVisible();
});

test("the aozora credit can be read on the work page and at the end of the last episode", { tag: "@AC-F8-2" }, async ({ page }) => {
  await openSeedWork(page, "蜘蛛の糸");
  const main = page.getByRole("main");
  await expect(main).toContainText("出典：青空文庫（https://www.aozora.gr.jp/）");
  await expect(main).toContainText("底本：「芥川龍之介全集2」ちくま文庫、筑摩書房");
  await expect(main).toContainText("入力：平山誠、野口英司");
  await expect(main).toContainText("校正：もりみつじゅんじ");

  await main.getByRole("link", { name: "三", exact: true }).click();
  await expect(page.getByRole("heading", { name: "三" })).toBeVisible();
  await expect(main).toContainText("入力：平山誠、野口英司");
  await expect(main).toContainText("青空文庫作成ファイル：");
});

test("aozora ruby is shown as ruby and aozora annotations do not appear", { tag: "@AC-F8-3" }, async ({ page }) => {
  await openSeedWork(page, "蜘蛛の糸");
  await page.getByRole("main").getByRole("link", { name: "一", exact: true }).click();
  await expect(page.getByRole("heading", { name: "一" })).toBeVisible();

  const main = page.getByRole("main");
  await expect(main.locator("ruby > rt").first()).toHaveText("おしゃかさま");
  expect(await main.locator("ruby").first().evaluate((ruby) => ruby.firstChild?.textContent)).toBe("御釈迦様");
  const text = (await main.textContent()) ?? "";
  expect(text).not.toContain("［＃");
  expect(text).not.toContain("《");
});
