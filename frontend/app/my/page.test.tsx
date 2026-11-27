import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import WorkspacePage, { metadata } from "./page";

test("the workspace page has its heading and title", () => {
  render(<WorkspacePage />);

  expect(screen.getByRole("heading", { level: 1, name: "ワークスペース" })).toBeInTheDocument();
  expect(metadata.title).toBe("ワークスペース | ヨミカキ");
});
