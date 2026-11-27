import { fireEvent, render, screen } from "@testing-library/react";
import type { LinkProps } from "next/link";
import type { PropsWithChildren } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { navigateTo } from "@/lib/navigation";
import { LayoutLink } from "./LayoutLink";

const clientNavigation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/navigation", () => ({ navigateTo: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, onNavigate, children }: PropsWithChildren<LinkProps>) => (
    <a href={String(href)} onClick={(event) => {
      onNavigate?.(event);
      if (!event.defaultPrevented) clientNavigation(href);
      event.preventDefault();
    }}>{children}</a>
  ),
}));

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
});

test("@AC-F9-4 selecting the current page requests a fresh document with the current cookies", () => {
  window.history.replaceState(null, "", "/login");
  render(<LayoutLink href="/login" className="action">デモを始め直す</LayoutLink>);
  fireEvent.click(screen.getByRole("link", { name: "デモを始め直す" }));

  expect(navigateTo).toHaveBeenCalledExactlyOnceWith("/login");
  expect(clientNavigation).not.toHaveBeenCalled();
});

test.each(["/", "/login?from=home"])("following the login link from %s preserves client navigation", (from) => {
  window.history.replaceState(null, "", from);
  render(<LayoutLink href="/login" className="action">ログイン</LayoutLink>);
  fireEvent.click(screen.getByRole("link", { name: "ログイン" }));

  expect(clientNavigation).toHaveBeenCalledExactlyOnceWith("/login");
  expect(navigateTo).not.toHaveBeenCalled();
});
