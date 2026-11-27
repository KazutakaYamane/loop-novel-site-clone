import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { SiteHeader } from "./SiteHeader";

test("the given actions are placed in the header's action area", () => {
  render(<SiteHeader actions={<button type="button">操作</button>} />);

  const actions = within(screen.getByRole("banner")).getByTestId("header-actions");
  expect(within(actions).getByRole("button", { name: "操作" })).toBeInTheDocument();
});
