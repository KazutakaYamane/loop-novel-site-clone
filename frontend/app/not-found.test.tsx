import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import NotFound from "./not-found";

test("explains a missing page and links back to the top", () => {
  render(<NotFound />);

  expect(screen.getByRole("heading", { name: "お探しのページは見つかりませんでした" })).toBeVisible();
  expect(screen.getByText(/このページは現在ご覧いただけません/)).toBeVisible();
  expect(screen.getByRole("link", { name: "トップへ" })).toHaveAttribute("href", "/");
});
