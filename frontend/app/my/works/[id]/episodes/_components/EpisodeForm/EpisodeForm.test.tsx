import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { EpisodeInput, EpisodeSaveResult } from "@/lib/api/episodeMutations";
import type { Episode } from "@/lib/api/myEpisodes";
import { EpisodeForm } from "./EpisodeForm";

const visited: string[] = [];
vi.mock("@/lib/navigation", () => ({
  navigateTo: (path: string) => {
    visited.push(path);
  },
}));

type Call = { action: "create" | "save" | "publish"; workId: number; episodeId?: number; input: EpisodeInput };
const calls: Call[] = [];
let result: EpisodeSaveResult;
let gate: Promise<void>;
async function record(call: Call) {
  calls.push(call);
  await gate;
  return result;
}
vi.mock("@/lib/api/episodeMutations", () => ({
  createEpisode: (workId: number, input: EpisodeInput) => record({ action: "create", workId, input }),
  saveEpisode: (workId: number, episodeId: number, input: EpisodeInput) => record({ action: "save", workId, episodeId, input }),
  publishEpisode: (workId: number, episodeId: number, input: EpisodeInput) => record({ action: "publish", workId, episodeId, input }),
}));

const draft: Episode = { id: 2, work_id: 5, title: "第2話", body: "途中まで", status: "draft", published_at: null };

beforeEach(() => {
  visited.length = 0;
  calls.length = 0;
  result = { ok: true, episode: draft };
  gate = Promise.resolve();
});

test("@AC-F4-1 a new episode is saved as a draft and its editor opens", async () => {
  result = { ok: true, episode: { ...draft, id: 9 } };
  render(<EpisodeForm workId={5} />);

  await userEvent.type(screen.getByLabelText("エピソードタイトル"), "第1話");
  fireEvent.change(screen.getByLabelText("本文"), { target: { value: "　一行目\n二行目" } });
  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));

  await waitFor(() => expect(visited).toEqual(["/my/works/5/episodes/9/edit"]));
  expect(calls).toEqual([{ action: "create", workId: 5, input: { title: "第1話", body: "　一行目\n二行目" } }]);
  expect(screen.queryByRole("button", { name: "公開する" })).toBeNull();
});

test("@AC-F4-2 a draft starts from its saved content and is saved again and again", async () => {
  render(<EpisodeForm workId={5} episode={draft} />);
  expect(screen.getByLabelText("エピソードタイトル")).toHaveValue("第2話");
  expect(screen.getByLabelText("本文")).toHaveValue("途中まで");

  fireEvent.change(screen.getByLabelText("本文"), { target: { value: "続きを書いた" } });
  result = { ok: true, episode: { ...draft, body: "続きを書いた" } };
  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));
  expect(await screen.findByRole("status")).toHaveTextContent("下書きを保存しました。");

  fireEvent.change(screen.getByLabelText("本文"), { target: { value: "さらに書いた" } });
  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));

  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls).toEqual([
    { action: "save", workId: 5, episodeId: 2, input: { title: "第2話", body: "続きを書いた" } },
    { action: "save", workId: 5, episodeId: 2, input: { title: "第2話", body: "さらに書いた" } },
  ]);
  expect(visited).toEqual([]);
});

test("the saved message goes away when the content changes", async () => {
  render(<EpisodeForm workId={5} episode={draft} />);
  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));
  expect(await screen.findByRole("status")).toHaveTextContent("下書きを保存しました。");

  await userEvent.type(screen.getByLabelText("エピソードタイトル"), "!");

  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

test("@AC-F4-6 a draft is published with the content in the form, and the work page opens", async () => {
  render(<EpisodeForm workId={5} episode={draft} />);
  fireEvent.change(screen.getByLabelText("本文"), { target: { value: "書き上げた" } });

  await userEvent.click(screen.getByRole("button", { name: "公開する" }));

  await waitFor(() => expect(visited).toEqual(["/my/works/5"]));
  expect(calls).toEqual([{ action: "publish", workId: 5, episodeId: 2, input: { title: "第2話", body: "書き上げた" } }]);
});

test("@AC-F4-6 an empty body is not published and the reason is shown under the body", async () => {
  result = { ok: false, errors: { body: ["本文が空のエピソードは公開できません。"] } };
  render(<EpisodeForm workId={5} episode={{ ...draft, body: "" }} />);

  await userEvent.click(screen.getByRole("button", { name: "公開する" }));

  const body = screen.getByLabelText("本文");
  await waitFor(() => expect(body).toHaveAttribute("aria-invalid", "true"));
  expect(body).toHaveAccessibleDescription("本文が空のエピソードは公開できません。");
  expect(visited).toEqual([]);
  expect(screen.getByRole("button", { name: "公開する" })).toBeEnabled();
});

test("@AC-F4-7 a refused change is shown and nothing moves", async () => {
  result = { ok: false, errors: { form: ["このエピソードは編集できません。"] } };
  render(<EpisodeForm workId={5} episode={draft} />);

  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("このエピソードは編集できません。");
  expect(visited).toEqual([]);
});

test("a title error is shown under the title", async () => {
  result = { ok: false, errors: { title: ["エピソードタイトルを入力してください。"] } };
  render(<EpisodeForm workId={5} />);

  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));

  const title = screen.getByLabelText("エピソードタイトル");
  await waitFor(() => expect(title).toHaveAttribute("aria-invalid", "true"));
  expect(title).toHaveAccessibleDescription("エピソードタイトルを入力してください。");
  expect(screen.getByLabelText("本文")).toHaveAttribute("aria-invalid", "false");
});

test("the buttons are disabled while sending, so a draft is not sent twice", async () => {
  let release = () => {};
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  render(<EpisodeForm workId={5} episode={draft} />);

  await userEvent.click(screen.getByRole("button", { name: "下書き保存" }));

  expect(screen.getByRole("button", { name: "下書き保存" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "公開する" })).toBeDisabled();
  release();
  await waitFor(() => expect(screen.getByRole("button", { name: "下書き保存" })).toBeEnabled());
  expect(calls).toHaveLength(1);
});

test("the body shows its length and is not cut by maxlength", () => {
  render(<EpisodeForm workId={5} episode={{ ...draft, body: "あいう" }} />);

  expect(screen.getByText("3文字")).toBeInTheDocument();
  expect(screen.getByLabelText("本文")).not.toHaveAttribute("maxlength");
  expect(screen.getByLabelText("エピソードタイトル")).not.toHaveAttribute("maxlength");
});
