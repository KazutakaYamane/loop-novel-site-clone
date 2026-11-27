import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import WorkspacePage, { metadata } from "./page";

// 作品の一覧はサーバー側で Laravel を呼ぶので、ここでは置き場所だけを確かめる
vi.mock("./_components/MyWorkList/MyWorkList", () => ({
  MyWorkList: () => <p>作品の一覧</p>,
}));

test("the workspace page has its heading and title", () => {
  render(<WorkspacePage />);

  expect(screen.getByRole("heading", { level: 1, name: "ワークスペース" })).toBeInTheDocument();
  expect(metadata.title).toBe("ワークスペース | ヨミカキ");
});

test("@AC-F3-1 the workspace leads to creating a new work and lists my works", () => {
  render(<WorkspacePage />);

  expect(screen.getByRole("heading", { level: 2, name: "小説" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "新しい小説を作成" })).toHaveAttribute("href", "/my/works/new");
  expect(screen.getByText("作品の一覧")).toBeInTheDocument();
});
