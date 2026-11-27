import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import NewWorkPage, { metadata } from "./page";

vi.mock("./_components/NewWorkForm/NewWorkForm", () => ({
  NewWorkForm: () => <p>新しい小説のフォーム</p>,
}));

test("@AC-F3-1 the new work page has its heading, the way back and the form", () => {
  render(<NewWorkPage />);

  expect(screen.getByRole("heading", { level: 1, name: "新しい小説を作成" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "パンくずリスト" })).toContainElement(screen.getByRole("link", { name: "小説" }));
  expect(screen.getByRole("link", { name: "小説" })).toHaveAttribute("href", "/my");
  expect(screen.getByText("新しい小説のフォーム")).toBeInTheDocument();
  expect(metadata.title).toBe("新しい小説を作成 | ヨミカキ");
});
