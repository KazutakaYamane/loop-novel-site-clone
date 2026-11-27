import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { EpisodeSaveResult } from "@/lib/api/episodeMutations";
import type { Episode } from "@/lib/api/myEpisodes";
import { EpisodeForm } from "./EpisodeForm";

const visited: string[] = [];
vi.mock("@/lib/navigation", () => ({
  navigateTo: (path: string) => {
    visited.push(path);
  },
}));

let result: EpisodeSaveResult;
vi.mock("@/lib/api/episodeMutations", () => ({
  createEpisode: async () => result,
  saveEpisode: async () => result,
  publishEpisode: async () => result,
}));

const draft: Episode = { id: 2, work_id: 5, title: "第2話", body: "途中まで", status: "draft", published_at: null };
const limited: EpisodeSaveResult = { ok: false, errors: {}, rateLimited: true };
const notice = "エピソードを保存できる回数の上限に達しました。";

beforeEach(() => {
  visited.length = 0;
});

test("@AC-F4-9 the notice is not shown before the limit is reached", () => {
  render(<EpisodeForm workId={5} episode={draft} />);

  expect(screen.queryByText(notice, { exact: false })).toBeNull();
});

test("@AC-F4-9 saving a new episode over the limit shows the notice and stays on the editor", async () => {
  result = limited;
  render(<EpisodeForm workId={5} />);

  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(notice);
  expect(visited).toEqual([]);
});

test("@AC-F4-9 saving or publishing a draft over the limit shows the notice until a later submission succeeds", async () => {
  result = limited;
  render(<EpisodeForm workId={5} episode={draft} />);

  await userEvent.click(screen.getByRole("button", { name: "公開する" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(notice);
  expect(visited).toEqual([]);

  result = { ok: false, errors: { title: ["エピソードタイトルを入力してください。"] } };
  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));
  expect(await screen.findByText("エピソードタイトルを入力してください。")).toBeVisible();
  expect(screen.queryByText(notice, { exact: false })).toBeNull();

  result = limited;
  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(notice);

  result = { ok: true, episode: draft };
  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));
  expect(await screen.findByRole("status")).toHaveTextContent("下書きを保存しました。");
  expect(screen.queryByRole("alert")).toBeNull();
});
