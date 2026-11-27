import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("@AC-F2-1 the top page has the demo author and demo reader buttons", () => {
  render(<Home />);

  const main = screen.getByRole("main");
  expect(within(main).getByRole("button", { name: "デモ作者として始める" })).toBeInTheDocument();
  expect(within(main).getByRole("button", { name: "デモ読者として始める" })).toBeInTheDocument();
});
