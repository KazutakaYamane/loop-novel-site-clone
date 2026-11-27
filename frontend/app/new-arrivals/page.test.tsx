import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import NewArrivalsPage, { metadata } from "./page";

vi.mock("./_components/RequestedNewArrivals", () => ({
  RequestedNewArrivals: () => <p>新着の一覧</p>,
}));

test("the new arrivals page has its heading, title and list", () => {
  render(<NewArrivalsPage params={Promise.resolve({})} searchParams={Promise.resolve({})} />);

  expect(screen.getByRole("heading", { level: 1, name: "新着小説の一覧" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("新着の一覧");
  expect(metadata.title).toBe("新着小説 | ヨミカキ");
});
