import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import LoginPage, { metadata } from "./page";

test("@AC-F1-5 the login page says sign-up and login are disabled and shows the demo buttons", () => {
  render(<LoginPage />);

  const main = screen.getByRole("main");
  expect(within(main).getByRole("heading", { level: 1, name: "ログイン" })).toBeInTheDocument();
  expect(main).toHaveTextContent("個人情報を保持しないため、会員登録とログインを無効にしています。");
  expect(within(main).getByRole("button", { name: "デモ作者として始める" })).toBeInTheDocument();
  expect(within(main).getByRole("button", { name: "デモ読者として始める" })).toBeInTheDocument();
});

test("@AC-F1-5 the login page has no email or password fields", () => {
  const { container } = render(<LoginPage />);

  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByLabelText(/メールアドレス|パスワード/)).toBeNull();
  expect(container.querySelector("input, form, textarea")).toBeNull();
});

test("the login page has its own title", () => {
  expect(metadata.title).toBe("ログイン | ヨミカキ");
});
