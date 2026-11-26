import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("the top page shows the getting-started heading and links", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "To get started, edit the page.tsx file.",
  );
  expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute(
    "target",
    "_blank",
  );
});
