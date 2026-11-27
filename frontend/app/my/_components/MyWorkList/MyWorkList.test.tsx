import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Work } from "@/lib/api/works";
import { MyWorkList } from "./MyWorkList";

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "yomikaki_session=mine" }),
}));

function work(overrides: Partial<Work>): Work {
  return {
    id: 1,
    title: "題",
    catchphrase: null,
    introduction: null,
    genre: null,
    tags: [],
    rating_cruel: false,
    rating_violent: false,
    rating_sexual: false,
    serial_status: "running",
    ...overrides,
  };
}

let works: Work[];
beforeEach(() => {
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "http://nginx:8080/api/my/works" && new Headers(init?.headers).get("Cookie") === "yomikaki_session=mine") {
      return Response.json({ data: works });
    }
    return new Response(null, { status: 401 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("@AC-F3-1 my works are listed with their serial status and a link to each", async () => {
  works = [work({ id: 3, title: "新しい作品", serial_status: "completed" }), work({ id: 2, title: "古い作品" })];

  render(await MyWorkList());

  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByRole("link", { name: "新しい作品" })).toHaveAttribute("href", "/my/works/3");
  expect(within(items[0]).getByText("完結済")).toBeInTheDocument();
  expect(within(items[1]).getByRole("link", { name: "古い作品" })).toHaveAttribute("href", "/my/works/2");
  expect(within(items[1]).getByText("連載中")).toBeInTheDocument();
  expect(screen.queryByText("まだ小説がありません。")).toBeNull();
});

test("an empty workspace says there are no works yet", async () => {
  works = [];

  render(await MyWorkList());

  expect(screen.getByText("まだ小説がありません。")).toBeInTheDocument();
  expect(screen.queryByRole("list")).toBeNull();
});
