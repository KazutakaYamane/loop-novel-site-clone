import type { Page } from "@playwright/test";
import { expect } from "./clientAddress";

export async function publishNotationEpisode(page: Page, body: string) {
  const title = "ルビのある夜景";
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "デモ作者として始める" }).click();
  await expect(page).toHaveURL(/\/my\/works\/\d+\/episodes\/\d+\/edit$/);
  const workPath = new URL(page.url()).pathname.split("/episodes/")[0];

  await page.getByLabel("エピソードタイトル").fill(title);
  await page.getByLabel("本文").fill(body);
  await page.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(workPath);

  await page.goto(workPath.replace(/^\/my/, ""));
  await page.getByRole("navigation", { name: "目次" }).getByRole("link", { name: title }).click();
  return page.getByTestId("episode-body");
}
