import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { SaveResult, WorkSettings } from "@/lib/api/workMutations";
import type { GenreOption, Work } from "@/lib/api/works";
import { WorkSettingsForm } from "./WorkSettingsForm";

const visited: string[] = [];
vi.mock("@/lib/navigation", () => ({
  navigateTo: (path: string) => {
    visited.push(path);
  },
}));

const updates: { id: number; settings: WorkSettings }[] = [];
let result: SaveResult;
let gate: Promise<void>;
vi.mock("@/lib/api/workMutations", () => ({
  updateWork: async (id: number, settings: WorkSettings) => {
    updates.push({ id, settings });
    await gate;
    return result;
  },
}));

const genres: GenreOption[] = [
  { value: "fantasy", label: "異世界ファンタジー" },
  { value: "sf", label: "SF" },
  { value: "mystery", label: "ミステリー" },
];

const work: Work = {
  id: 5,
  title: "元のタイトル",
  catchphrase: "元の一行",
  introduction: "元の紹介文",
  genre: "sf",
  tags: ["宇宙", "旅"],
  rating_cruel: false,
  rating_violent: true,
  rating_sexual: false,
  serial_status: "running",
};

beforeEach(() => {
  visited.length = 0;
  updates.length = 0;
  result = { ok: true, work };
  gate = Promise.resolve();
});

function renderForm(overrides: Partial<Work> = {}) {
  render(<WorkSettingsForm work={{ ...work, ...overrides }} genres={genres} />);
}

test("@AC-F3-2 the form starts from the current settings", () => {
  renderForm();

  expect(screen.getByLabelText("小説タイトル")).toHaveValue("元のタイトル");
  expect(screen.getByLabelText("キャッチコピー")).toHaveValue("元の一行");
  expect(screen.getByLabelText("紹介文")).toHaveValue("元の紹介文");
  expect(screen.getByRole("radio", { name: "SF" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "異世界ファンタジー" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "連載中" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "完結済" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "残酷描写有り" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "暴力描写有り" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "性描写有り" })).not.toBeChecked();
  expect(screen.getByLabelText("タグ1")).toHaveValue("宇宙");
  expect(screen.getByLabelText("タグ2")).toHaveValue("旅");
  expect(screen.getByLabelText("タグ3")).toHaveValue("");
  expect(screen.getByLabelText("タグ8")).toHaveValue("");
  expect(screen.queryByLabelText("タグ9")).toBeNull();
});

test("a work without optional settings starts empty", () => {
  renderForm({ catchphrase: null, introduction: null, genre: null, tags: [] });

  expect(screen.getByLabelText("キャッチコピー")).toHaveValue("");
  expect(screen.getByLabelText("紹介文")).toHaveValue("");
  for (const genre of genres) {
    expect(screen.getByRole("radio", { name: genre.label })).not.toBeChecked();
  }
  expect(screen.getByText("残り35文字")).toBeInTheDocument();
  expect(screen.getByText("0文字")).toBeInTheDocument();
});

test("@AC-F3-2 every setting is sent and the work page is opened after saving", async () => {
  renderForm();

  await userEvent.click(screen.getByRole("radio", { name: "完結済" }));
  await userEvent.clear(screen.getByLabelText("小説タイトル"));
  await userEvent.type(screen.getByLabelText("小説タイトル"), "新しいタイトル");
  await userEvent.click(screen.getByRole("radio", { name: "ミステリー" }));
  await userEvent.clear(screen.getByLabelText("キャッチコピー"));
  await userEvent.type(screen.getByLabelText("キャッチコピー"), "新しい一行");
  await userEvent.clear(screen.getByLabelText("紹介文"));
  await userEvent.type(screen.getByLabelText("紹介文"), "新しい紹介文");
  await userEvent.click(screen.getByRole("checkbox", { name: "残酷描写有り" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "暴力描写有り" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "性描写有り" }));
  await userEvent.clear(screen.getByLabelText("タグ1"));
  await userEvent.type(screen.getByLabelText("タグ3"), " 探偵 ");
  await userEvent.type(screen.getByLabelText("タグ8"), "学園");
  await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));

  await waitFor(() => expect(visited).toEqual(["/my/works/5"]));
  expect(updates).toEqual([
    {
      id: 5,
      settings: {
        title: "新しいタイトル",
        catchphrase: "新しい一行",
        introduction: "新しい紹介文",
        genre: "mystery",
        tags: ["旅", "探偵", "学園"],
        rating_cruel: true,
        rating_violent: false,
        rating_sexual: true,
        serial_status: "completed",
      },
    },
  ]);
});

test("switching back to running is sent", async () => {
  renderForm({ serial_status: "completed" });

  await userEvent.click(screen.getByRole("radio", { name: "連載中" }));
  await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));

  await waitFor(() => expect(updates).toHaveLength(1));
  expect(updates[0].settings.serial_status).toBe("running");
});

test("@AC-F3-3 the genre choices are the ones given, in order", () => {
  renderForm();

  const group = screen.getByRole("group", { name: "ジャンル" });
  expect(within(group).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual(["fantasy", "sf", "mystery"]);
});

test("@AC-F3-3 the catchphrase shows how many characters are left and marks going over", async () => {
  renderForm({ catchphrase: null });
  const catchphrase = screen.getByLabelText("キャッチコピー");

  await userEvent.type(catchphrase, "あ".repeat(35));
  expect(screen.getByText("残り0文字")).toBeInTheDocument();
  expect(catchphrase).toHaveAttribute("aria-invalid", "false");

  await userEvent.type(catchphrase, "い");
  expect(screen.getByText("残り-1文字")).toBeInTheDocument();
  expect(catchphrase).toHaveAttribute("aria-invalid", "true");
});

test("@AC-F3-3 the introduction shows its length and marks going over", async () => {
  renderForm({ introduction: "あ".repeat(10000) });
  const introduction = screen.getByLabelText("紹介文");
  expect(screen.getByText("10000文字")).toBeInTheDocument();
  expect(introduction).toHaveAttribute("aria-invalid", "false");

  await userEvent.type(introduction, "い");

  expect(screen.getByText("10001文字")).toBeInTheDocument();
  expect(introduction).toHaveAttribute("aria-invalid", "true");
});

test("@AC-F3-3 the messages from laravel are shown under each field", async () => {
  result = {
    ok: false,
    errors: {
      title: ["小説タイトルは100文字以内で入力してください。"],
      catchphrase: ["キャッチコピーは35文字以内で入力してください。"],
      introduction: ["紹介文は10000文字以内で入力してください。"],
      tags: ["タグは8つまで設定できます。"],
      "tags.1": ["タグは1つ20文字以内で入力してください。"],
    },
  };
  renderForm();

  await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));

  expect(await screen.findByText("キャッチコピーは35文字以内で入力してください。")).toBeInTheDocument();
  expect(screen.getByLabelText("小説タイトル")).toHaveAccessibleDescription("小説タイトルは100文字以内で入力してください。");
  expect(screen.getByLabelText("小説タイトル")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("キャッチコピー")).toHaveAccessibleDescription("キャッチコピーは35文字以内で入力してください。");
  expect(screen.getByLabelText("キャッチコピー")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("紹介文")).toHaveAccessibleDescription("紹介文は10000文字以内で入力してください。");
  expect(screen.getByLabelText("紹介文")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("group", { name: "タグ" })).toHaveAccessibleDescription(
    "タグは8つまで設定できます。 タグは1つ20文字以内で入力してください。",
  );
  expect(visited).toEqual([]);
  expect(screen.getByRole("button", { name: "変更を保存" })).toBeEnabled();
});

test("@AC-F3-4 a refused change is announced", async () => {
  result = { ok: false, errors: { form: ["この小説は編集できません。"] } };
  renderForm();

  await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("この小説は編集できません。");
  expect(screen.getByLabelText("小説タイトル")).toHaveAttribute("aria-invalid", "false");
  expect(screen.getByRole("group", { name: "タグ" })).toHaveAccessibleDescription("");
  expect(visited).toEqual([]);
});

test("cancelling goes back to the work", () => {
  renderForm();

  expect(screen.getByRole("link", { name: "キャンセル" })).toHaveAttribute("href", "/my/works/5");
});

test("the form cannot be sent twice while saving", async () => {
  let release: () => void = () => {};
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  renderForm();

  await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));
  expect(screen.getByRole("button", { name: "変更を保存" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));
  release();

  await waitFor(() => expect(visited).toEqual(["/my/works/5"]));
  expect(updates).toHaveLength(1);
});

test("sending the settings stays on the page instead of the browser's own submission", () => {
  renderForm();

  expect(fireEvent.submit(screen.getByRole("form", { name: "小説の設定" }))).toBe(false);
});
