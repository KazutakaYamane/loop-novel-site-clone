import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HeaderActions } from "./HeaderActions";

test("@AC-F2-1 a guest sees the demo buttons in the header", () => {
  render(<HeaderActions user={null} />);

  expect(screen.getByRole("button", { name: "デモ作者として始める" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "デモ読者として始める" })).toBeInTheDocument();
  expect(screen.queryByTestId("current-user")).toBeNull();
});

test("a logged-in user sees their name instead of the demo buttons", () => {
  render(<HeaderActions user={{ name: "デモ読者" }} />);

  expect(screen.getByTestId("current-user")).toHaveTextContent("デモ読者");
  expect(screen.getByTestId("current-user")).toHaveAccessibleName("ログイン中: デモ読者");
  expect(screen.queryByRole("button", { name: /デモ.*として始める/ })).toBeNull();
});
