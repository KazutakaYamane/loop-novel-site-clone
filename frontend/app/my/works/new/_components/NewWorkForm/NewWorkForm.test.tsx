import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { SaveResult } from "@/lib/api/workMutations";
import { NewWorkForm } from "./NewWorkForm";

const visited: string[] = [];
vi.mock("@/lib/navigation", () => ({
  navigateTo: (path: string) => {
    visited.push(path);
  },
}));

const created: { title: string; introduction: string }[] = [];
let result: SaveResult;
let gate: Promise<void>;
vi.mock("@/lib/api/workMutations", () => ({
  createWork: async (input: { title: string; introduction: string }) => {
    created.push(input);
    await gate;
    return result;
  },
}));

const work = {
  id: 12,
  title: "星を数える旅",
  catchphrase: null,
  introduction: "紹介文",
  genre: null,
  tags: [],
  rating_cruel: false,
  rating_violent: false,
  rating_sexual: false,
  serial_status: "running" as const,
};

beforeEach(() => {
  visited.length = 0;
  created.length = 0;
  result = { ok: true, work };
  gate = Promise.resolve();
});

test("@AC-F3-1 a work is created from the title and the introduction and opened", async () => {
  render(<NewWorkForm />);

  await userEvent.type(screen.getByLabelText("小説タイトル"), "星を数える旅");
  await userEvent.type(screen.getByLabelText("紹介文"), "夜空の話");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => expect(visited).toEqual(["/my/works/12"]));
  expect(created).toEqual([{ title: "星を数える旅", introduction: "夜空の話" }]);
});

test("the introduction shows how many characters it has", async () => {
  render(<NewWorkForm />);
  expect(screen.getByText("0文字")).toBeInTheDocument();
  expect(screen.getByLabelText("紹介文")).toHaveAttribute("aria-invalid", "false");

  await userEvent.type(screen.getByLabelText("紹介文"), "あいう");

  expect(screen.getByText("3文字")).toBeInTheDocument();
});

test("@AC-F3-3 the messages from laravel are shown under each field and nothing is opened", async () => {
  result = {
    ok: false,
    errors: { title: ["小説タイトルは100文字以内で入力してください。"], introduction: ["紹介文は10000文字以内で入力してください。"] },
  };
  render(<NewWorkForm />);

  await userEvent.type(screen.getByLabelText("小説タイトル"), "長いタイトル");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("小説タイトルは100文字以内で入力してください。")).toBeInTheDocument();
  expect(screen.getByLabelText("小説タイトル")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("小説タイトル")).toHaveAccessibleDescription("小説タイトルは100文字以内で入力してください。");
  expect(screen.getByLabelText("紹介文")).toHaveAccessibleDescription("紹介文は10000文字以内で入力してください。");
  expect(screen.getByLabelText("紹介文")).toHaveAttribute("aria-invalid", "true");
  expect(visited).toEqual([]);
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
});

test("a failure that is not about a field is announced", async () => {
  result = { ok: false, errors: { form: ["保存できませんでした。時間をおいてもう一度お試しください。"] } };
  render(<NewWorkForm />);

  await userEvent.type(screen.getByLabelText("小説タイトル"), "題");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした。時間をおいてもう一度お試しください。");
  expect(screen.getByLabelText("小説タイトル")).toHaveAttribute("aria-invalid", "false");
});

test("the form cannot be sent twice while saving", async () => {
  let release: () => void = () => {};
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  render(<NewWorkForm />);

  await userEvent.type(screen.getByLabelText("小説タイトル"), "題");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  release();
  await waitFor(() => expect(visited).toEqual(["/my/works/12"]));
  expect(created).toHaveLength(1);
});

test("sending the form stays on the page instead of the browser's own submission", () => {
  render(<NewWorkForm />);

  expect(fireEvent.submit(screen.getByRole("form", { name: "新しい小説" }))).toBe(false);
});
