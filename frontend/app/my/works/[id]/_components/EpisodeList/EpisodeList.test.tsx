import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EpisodeList } from "./EpisodeList";

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "yomikaki_session=mine" }),
}));

let episodesResponse: () => Response;
beforeEach(() => {
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "http://nginx:8080/api/my/works/5/episodes" && new Headers(init?.headers).get("Cookie") === "yomikaki_session=mine") {
      return episodesResponse();
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("@AC-F4-8 the episodes are listed in the order they were created, with their state", async () => {
  episodesResponse = () =>
    Response.json({
      data: [
        { id: 3, title: "第1話 はじまり", status: "published", published_at: "2026-11-27T03:04:00+00:00" },
        { id: 1, title: "第2話 つづき", status: "draft", published_at: null },
        { id: 2, title: "第3話 おわり", status: "draft", published_at: null },
      ],
    });

  render(await EpisodeList({ workId: 5 }));

  const list = screen.getByRole("list", { name: "エピソード" });
  const items = within(list).getAllByRole("listitem");
  expect(items.map((item) => within(item).getByRole("link").textContent)).toEqual(["第1話 はじまり", "第2話 つづき", "第3話 おわり"]);
  expect(within(items[0]).getByText("公開中")).toBeInTheDocument();
  expect(within(items[0]).getByText("2026年11月27日 12:04")).toBeInTheDocument();
  expect(within(items[1]).getByText("下書き")).toBeInTheDocument();
  expect(within(items[0]).getByRole("link")).toHaveAttribute("href", "/my/works/5/episodes/3/edit");
  expect(within(items[1]).getByRole("link")).toHaveAttribute("href", "/my/works/5/episodes/1/edit");
  expect(screen.getByRole("heading", { level: 2, name: "エピソード" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "エピソードを作成" })).toHaveAttribute("href", "/my/works/5/episodes/new");
});

test("a work without episodes says so and still offers to create one", async () => {
  episodesResponse = () => Response.json({ data: [] });

  render(await EpisodeList({ workId: 5 }));

  expect(screen.getByText("エピソードはまだありません。")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "エピソード" })).toBeNull();
  expect(screen.getByRole("link", { name: "エピソードを作成" })).toHaveAttribute("href", "/my/works/5/episodes/new");
});

test("@AC-F4-7 nothing is listed when the episodes cannot be read as the owner", async () => {
  for (const status of [403, 404]) {
    episodesResponse = () => new Response(null, { status });

    const { container } = render(await EpisodeList({ workId: 5 }));

    expect(container).toBeEmptyDOMElement();
  }
});
