import type { Page } from "@playwright/test";
import { expect, test } from "../support/clientAddress";

async function expectEditorToWaitForHydration(page: Page, path: string, editingDraft: boolean) {
  const scripts = "**/_next/static/**/*.js";
  const { promise, resolve } = Promise.withResolvers<void>();
  await page.route(scripts, async (route) => {
    await promise;
    await route.continue();
  });

  const save = page.getByRole("button", { name: "下書き保存" });
  const publish = page.getByRole("button", { name: "公開する" });
  const title = page.getByLabel("エピソードタイトル");
  const body = page.getByLabel("本文");
  try {
    await page.goto(path, { waitUntil: "commit" });
    await expect(save).toBeVisible();
    if (editingDraft) {
      await expect(publish).toBeVisible();
      await publish.click({ force: true });
      expect(await publish.isDisabled(), "publish before hydration").toBe(true);
    }
    expect(await save.isDisabled(), "save before hydration").toBe(true);
    expect(await title.isDisabled(), "title before hydration").toBe(true);
    expect(await body.isDisabled(), "body before hydration").toBe(true);
  } finally {
    resolve();
    await page.unrouteAll({ behavior: "wait" });
  }

  await expect(save).toBeEnabled();
  if (editingDraft) {
    await expect(publish).toBeEnabled();
  }
}

async function openDemoDraft(page: Page) {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
  return new URL(page.url()).pathname;
}

test("a draft can be edited and published once the editor's JavaScript loads", async ({ page, context }) => {
  const draftPath = await openDemoDraft(page);
  const workPath = draftPath.split("/episodes/")[0];
  const editor = await context.newPage();

  await expectEditorToWaitForHydration(editor, draftPath, true);
  const title = "読み込み後に公開した話";
  await editor.getByLabel("エピソードタイトル").fill(title);
  await editor.getByLabel("本文").fill("《《傍点》》のある本文。");
  await editor.getByRole("button", { name: "公開する" }).click();
  await expect(editor).toHaveURL(workPath);

  await editor.goto(workPath.replace(/^\/my/, ""));
  await editor.getByRole("navigation", { name: "目次" }).getByRole("link", { name: title }).click();
  await expect(editor.getByTestId("episode-body").locator("em")).toHaveText("傍点");
});

test("a new episode can be written and saved once the editor's JavaScript loads", async ({ page, context }) => {
  const draftPath = await openDemoDraft(page);
  const workPath = draftPath.split("/episodes/")[0];
  const editor = await context.newPage();

  await expectEditorToWaitForHydration(editor, `${workPath}/episodes/new`, false);
  const title = "読み込み後に書いた話";
  await editor.getByLabel("エピソードタイトル").fill(title);
  await editor.getByLabel("本文").fill("下書きの本文。");
  await editor.getByRole("button", { name: "下書き保存" }).click();
  await expect(editor).toHaveURL(/\/episodes\/\d+\/edit$/);
  await expect(editor.getByLabel("エピソードタイトル")).toHaveValue(title);
  await expect(editor.getByLabel("本文")).toHaveValue("下書きの本文。");
});
