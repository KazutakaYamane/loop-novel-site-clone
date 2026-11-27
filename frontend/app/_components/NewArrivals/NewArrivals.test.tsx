import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { fetchNewArrivals, type NewArrivalWork } from "@/lib/api/newArrivals";
import { NewArrivals } from "./NewArrivals";

vi.mock("@/lib/api/newArrivals", () => ({ fetchNewArrivals: vi.fn() }));

const works: NewArrivalWork[] = [
  { id: 8, title: "新しい更新", catchphrase: "遠い岸から", introduction: "岬の日誌", author_name: "灯台の作者" },
  { id: 3, title: "古い更新", catchphrase: null, introduction: null, author_name: "海の作者" },
];

beforeEach(() => {
  vi.mocked(fetchNewArrivals).mockReset();
});

test("@AC-F7-1 lists works in the order the API returns them, newest publication first", async () => {
  vi.mocked(fetchNewArrivals).mockResolvedValue({ works, page: 1, hasNext: false });

  render(await NewArrivals({ page: 1 }));

  const section = screen.getByRole("region", { name: "新着小説" });
  const items = within(section).getAllByRole("article");
  expect(items.map((item) => within(item).getByRole("heading", { level: 3 }).textContent)).toEqual(["新しい更新", "古い更新"]);
  for (const text of ["灯台の作者", "遠い岸から", "岬の日誌"]) {
    expect(within(items[0]).getByText(text, { exact: true })).toBeVisible();
  }
  expect(within(items[0]).getByText("遠い岸から", { exact: true }).tagName).toBe("P");
  expect(within(items[0]).getByText("岬の日誌", { exact: true }).tagName).toBe("P");
  expect(within(items[1]).getByText("海の作者", { exact: true })).toBeVisible();
  expect(screen.queryByText("公開されている小説はまだありません。")).toBeNull();
  expect(fetchNewArrivals).toHaveBeenCalledExactlyOnceWith(1);
});

test("@AC-F7-2 each work links to its work page", async () => {
  vi.mocked(fetchNewArrivals).mockResolvedValue({ works, page: 1, hasNext: false });

  render(await NewArrivals({ page: 1 }));

  expect(screen.getByRole("link", { name: "新しい更新" })).toHaveAttribute("href", "/works/8");
  expect(screen.getByRole("link", { name: "古い更新" })).toHaveAttribute("href", "/works/3");
});

test("the first page links only to the next page", async () => {
  vi.mocked(fetchNewArrivals).mockResolvedValue({ works, page: 1, hasNext: true });

  render(await NewArrivals({ page: 1 }));

  const pager = screen.getByRole("navigation", { name: "ページ送り" });
  expect(within(pager).getByRole("link", { name: "次へ" })).toHaveAttribute("href", "/new-arrivals?page=2");
  expect(within(pager).queryByRole("link", { name: "前へ" })).toBeNull();
  expect(fetchNewArrivals).toHaveBeenCalledExactlyOnceWith(1);
});

test("a later page links back to the previous page and on to the next", async () => {
  vi.mocked(fetchNewArrivals).mockResolvedValue({ works, page: 3, hasNext: true });

  render(await NewArrivals({ page: 3 }));

  const pager = screen.getByRole("navigation", { name: "ページ送り" });
  expect(within(pager).getByRole("link", { name: "前へ" })).toHaveAttribute("href", "/new-arrivals?page=2");
  expect(within(pager).getByRole("link", { name: "次へ" })).toHaveAttribute("href", "/new-arrivals?page=4");
  expect(fetchNewArrivals).toHaveBeenCalledExactlyOnceWith(3);
});

test("the second page links back to the top itself", async () => {
  vi.mocked(fetchNewArrivals).mockResolvedValue({ works, page: 2, hasNext: false });

  render(await NewArrivals({ page: 2 }));

  const pager = screen.getByRole("navigation", { name: "ページ送り" });
  expect(within(pager).getByRole("link", { name: "前へ" })).toHaveAttribute("href", "/");
  expect(within(pager).queryByRole("link", { name: "次へ" })).toBeNull();
});

test("@AC-F3-5 tells that nothing is published when no work has a published episode", async () => {
  vi.mocked(fetchNewArrivals).mockResolvedValue({ works: [], page: 1, hasNext: false });

  render(await NewArrivals({ page: 1 }));

  expect(screen.queryAllByRole("article")).toHaveLength(0);
  expect(screen.getByText("公開されている小説はまだありません。")).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "ページ送り" })).toBeNull();
});

test("a page past the last work says the page is empty and links back", async () => {
  vi.mocked(fetchNewArrivals).mockResolvedValue({ works: [], page: 9, hasNext: false });

  render(await NewArrivals({ page: 9 }));

  expect(screen.getByText("このページに小説はありません。")).toBeVisible();
  expect(screen.queryByText("公開されている小説はまだありません。")).toBeNull();
  expect(within(screen.getByRole("navigation", { name: "ページ送り" })).getByRole("link", { name: "前へ" })).toHaveAttribute("href", "/new-arrivals?page=8");
});
