import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HeaderActions } from "./HeaderActions";

test("@AC-F1-6 a guest has a link to the login page in the header", () => {
  render(<HeaderActions user={null} />);

  expect(screen.getByRole("link", { name: "ログイン" })).toHaveAttribute("href", "/login");
  expect(screen.queryByRole("link", { name: /新規登録|会員登録/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "ログアウト" })).toBeNull();
});

test("@AC-F1-1 a logged-in user can log out from the header instead of logging in", () => {
  render(<HeaderActions user={{ name: "デモ読者 #1" }} />);

  expect(screen.getByRole("button", { name: "ログアウト" })).toBeEnabled();
  expect(screen.queryByRole("link", { name: "ログイン" })).toBeNull();
});
