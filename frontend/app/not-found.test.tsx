import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import NotFound from "./not-found";

test("explains a missing page and links back to the top", () => {
  render(<NotFound />);

  expect(screen.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  expect(screen.getByRole("link", { name: "トップへ戻る" })).toHaveAttribute("href", "/");
});
