import type { Page } from "@playwright/test";
import { expect, newClient, test, uniqueClientAddress } from "../support/clientAddress";

const workTitle = "灯台守の手帖";
const firstTitle = "第1話 岬の灯台";
const lastTitle = "第3話 船が戻る夜";
const workIntroduction = "岬の灯台に、ひとりの新しい灯台守がやってきた。\n前任者が残した手帖には、毎晩の天気と、海から届いた不思議な便りが書き留められていた。";
const body = "\n　船が帰ってきた。\n\n\n　<b>明かりをつけた。</b>\n";

async function publishThirdEpisode(page: Page) {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
  const workPath = new URL(page.url()).pathname.split("/episodes/")[0];

  await page.goto(workPath);
  await page.getByRole("link", { name: "エピソードを作成" }).click();
  await page.getByLabel("エピソードタイトル").fill(lastTitle);
  await page.getByLabel("本文").fill(body);
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(page).toHaveURL(/\/episodes\/\d+\/edit$/);
  const lastPath = new URL(page.url()).pathname.replace(/^\/my|\/edit$/g, "");
  await page.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(workPath);

  return { workPath: workPath.replace(/^\/my/, ""), lastPath };
}

test("a guest navigates between published episodes and returns to the contents", { tag: "@AC-F6-2" }, async ({ page, browser, baseURL }) => {
  const { workPath, lastPath } = await publishThirdEpisode(page);
  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const reader = await guest.newPage();
  await reader.goto(workPath);
  const contents = reader.getByRole("navigation", { name: "目次" });
  await expect(contents.getByRole("link")).toHaveText([firstTitle, lastTitle]);
  await contents.getByRole("link", { name: firstTitle }).click();

  const main = reader.getByRole("main");
  await expect(main.getByText(workTitle, { exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();
  await expect(main.getByText(/坂を上りきると、白い灯台が見えた/)).toBeVisible();
  await expect(main.getByRole("link", { name: "前の話" })).toHaveCount(0);
  await main.getByRole("link", { name: "次の話" }).click();

  await expect(reader).toHaveURL(lastPath);
  await expect(main.getByRole("heading", { level: 1, name: lastTitle })).toBeVisible();
  await expect(main.getByText("船が帰ってきた。", { exact: false })).toBeVisible();
  await expect(main.getByRole("link", { name: "次の話" })).toHaveCount(0);
  await main.getByRole("link", { name: "前の話" }).click();
  await expect(main.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();

  await main.getByRole("link", { name: "目次", exact: true }).click();
  await expect(reader).toHaveURL(workPath);
  await expect(contents.getByRole("link")).toHaveText([firstTitle, lastTitle]);
  await guest.close();
});

test("work and episode pages supply Open Graph titles and descriptions", { tag: "@AC-F6-3" }, async ({ page, browser, baseURL }) => {
  const { workPath, lastPath } = await publishThirdEpisode(page);
  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const reader = await guest.newPage();
  const title = reader.locator('meta[property="og:title"]');
  const description = reader.locator('meta[property="og:description"]');

  await reader.goto(workPath);
  await expect(title).toHaveAttribute("content", workTitle);
  await expect(description).toHaveAttribute("content", workIntroduction);

  await reader.getByRole("navigation", { name: "目次" }).getByRole("link", { name: lastTitle }).click();
  await expect(reader).toHaveURL(lastPath);
  await expect(title).toHaveAttribute("content", `${lastTitle} - ${workTitle}`);
  await expect(description).toHaveAttribute("content", workIntroduction);

  for (const [path, expectedTitle] of [[workPath, workTitle], [lastPath, `${lastTitle} - ${workTitle}`]]) {
    const response = await reader.request.get(path, { headers: { "User-Agent": "Twitterbot" } });
    expect(response.ok()).toBe(true);
    const head = (await response.text()).match(/<head>[\s\S]*?<\/head>/)?.[0] ?? "";
    expect(head).toContain(`<meta property="og:title" content="${expectedTitle}"`);
    expect(head).toContain('<meta property="og:description"');
    expect(head).toContain('<meta name="robots" content="noindex"');
  }
  await guest.close();
});

test("the reader preserves blank lines and shows markup literally", { tag: "@AC-F6-5" }, async ({ page, browser, baseURL }) => {
  const { lastPath } = await publishThirdEpisode(page);
  const guest = await newClient(browser, baseURL, uniqueClientAddress());
  const reader = await guest.newPage();
  await reader.goto(lastPath);
  const episodeBody = reader.getByTestId("episode-body");
  await expect(episodeBody).toBeVisible();
  expect(await episodeBody.textContent()).toBe(body);
  await expect(episodeBody).toHaveCSS("white-space", "pre-wrap");
  await expect(episodeBody.locator("b")).toHaveCount(0);
  await guest.close();
});
