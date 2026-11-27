import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RequestedNewArrivals } from "./RequestedNewArrivals";

// 一覧はサーバー側で Laravel を呼ぶので、ここではページの番号の渡し方だけを確かめる
vi.mock("@/app/_components/NewArrivals/NewArrivals", () => ({
  NewArrivals: ({ page }: { page: number }) => <p>新着の {page} ページ目</p>,
}));

test("shows the page named in the query", async () => {
  render(await RequestedNewArrivals({ searchParams: Promise.resolve({ page: "3" }) }));

  expect(screen.getByText("新着の 3 ページ目")).toBeVisible();
});

test("an invalid page number shows the first page", async () => {
  render(await RequestedNewArrivals({ searchParams: Promise.resolve({ page: "0" }) }));

  expect(screen.getByText("新着の 1 ページ目")).toBeVisible();
});
