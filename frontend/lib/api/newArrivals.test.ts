import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { connection } from "next/server";
import { fetchNewArrivals, newArrivalsPage } from "./newArrivals";

vi.mock("next/server", () => ({ connection: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(connection).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const work = {
  id: 3,
  title: "海の手帖",
  catchphrase: null,
  introduction: "岬の日誌",
  author_name: "灯台の作者",
  latest_episode_title: "朝の灯台",
};

test("@AC-F4-4 reads the requested page of new arrivals on every request without cookies", async () => {
  fetchMock.mockResolvedValue(Response.json({
    data: [work],
    links: { next: "http://nginx:8080/api/new-arrivals?page=3" },
    meta: { current_page: 2 },
  }));

  await expect(fetchNewArrivals(2)).resolves.toEqual({ works: [work], page: 2, hasNext: true });
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://nginx:8080/api/new-arrivals?page=2", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
});

test("the last page has no next page", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: [], links: { next: null }, meta: { current_page: 1 } }));

  await expect(fetchNewArrivals(1)).resolves.toEqual({ works: [], page: 1, hasNext: false });
});

test("a failed request is an error", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

  await expect(fetchNewArrivals(1)).rejects.toThrow("GET /api/new-arrivals?page=1 failed with 503");
});

test.each([
  [undefined, 1],
  ["2", 2],
  ["15", 15],
  ["0", 1],
  ["-1", 1],
  ["2.5", 1],
  ["abc", 1],
  ["", 1],
  [["3", "4"], 1],
])("the page query %j becomes page %i", (value, page) => {
  expect(newArrivalsPage(value)).toBe(page);
});

test("@AC-F4-4 waits for a request before reading the API, so the build never prerenders the list", async () => {
  let arrive = () => {};
  vi.mocked(connection).mockReturnValue(new Promise<void>((resolve) => { arrive = resolve; }));
  vi.stubEnv("INTERNAL_API_URL", "");
  fetchMock.mockResolvedValue(Response.json({ data: [work], links: { next: null }, meta: { current_page: 1 } }));

  const result = fetchNewArrivals(1);
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();

  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  arrive();
  await expect(result).resolves.toEqual({ works: [work], page: 1, hasNext: false });
  expect(fetchMock).toHaveBeenCalledOnce();
});
