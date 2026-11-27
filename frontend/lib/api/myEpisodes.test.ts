import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchMyEpisode, fetchMyEpisodes, findWritingPath } from "./myEpisodes";

const cookies = { toString: () => "yomikaki_session=mine" };

type Call = { url: string; cookie: string | null; accept: string | null; credentials?: RequestCredentials; cache?: RequestCache };
let calls: Call[];
let routes: Record<string, () => Response>;

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      cookie: headers.get("Cookie"),
      accept: headers.get("Accept"),
      credentials: init?.credentials,
      cache: init?.cache,
    });
    return routes[String(input)]?.() ?? new Response(null, { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const summaries = [
  { id: 1, title: "第1話", status: "published", published_at: "2026-11-27T03:00:00+00:00" },
  { id: 2, title: "第2話", status: "draft", published_at: null },
];

describe("fetchMyEpisodes", () => {
  test("@AC-F4-8 reads the episodes of my work in the order Laravel returns them, with my cookie", async () => {
    routes["http://nginx:8080/api/my/works/5/episodes"] = () => Response.json({ data: summaries });

    expect(await fetchMyEpisodes(cookies, 5)).toEqual({ status: "ok", episodes: summaries });
    expect(calls).toEqual([
      { url: "http://nginx:8080/api/my/works/5/episodes", cookie: "yomikaki_session=mine", accept: "application/json", cache: "no-store", credentials: undefined },
    ]);
  });

  test("@AC-F4-7 another user's work is forbidden", async () => {
    routes["http://nginx:8080/api/my/works/5/episodes"] = () => new Response(null, { status: 403 });

    expect(await fetchMyEpisodes(cookies, 5)).toEqual({ status: "forbidden" });
  });

  test("a work that does not exist is not found", async () => {
    expect(await fetchMyEpisodes(cookies, 9)).toEqual({ status: "not-found" });
  });

  test("other failures are errors", async () => {
    routes["http://nginx:8080/api/my/works/5/episodes"] = () => new Response(null, { status: 500 });

    await expect(fetchMyEpisodes(cookies, 5)).rejects.toThrow("GET /api/my/works/5/episodes failed with 500");
  });
});

describe("fetchMyEpisode", () => {
  const episode = { id: 2, work_id: 5, title: "第2話", body: "本文", status: "draft", published_at: null };

  test("@AC-F4-2 reads one episode of my work with my cookie", async () => {
    routes["http://nginx:8080/api/my/works/5/episodes/2"] = () => Response.json(episode);

    expect(await fetchMyEpisode(cookies, "5", "2")).toEqual({ status: "ok", episode });
    expect(calls[0]).toMatchObject({ cookie: "yomikaki_session=mine", accept: "application/json", cache: "no-store" });
  });

  test("@AC-F4-7 another user's episode is forbidden", async () => {
    routes["http://nginx:8080/api/my/works/5/episodes/2"] = () => new Response(null, { status: 403 });

    expect(await fetchMyEpisode(cookies, "5", "2")).toEqual({ status: "forbidden" });
  });

  test("a missing episode is not found", async () => {
    expect(await fetchMyEpisode(cookies, "5", "3")).toEqual({ status: "not-found" });
  });

  test("ids that are not numbers are not sent to Laravel", async () => {
    for (const [work, episodeId] of [["5", "../../user"], ["5?x=1", "2"], ["", "2"], ["5", "2/publication"]]) {
      expect(await fetchMyEpisode(cookies, work, episodeId)).toEqual({ status: "not-found" });
    }
    expect(calls).toEqual([]);
  });

  test("other failures are errors", async () => {
    routes["http://nginx:8080/api/my/works/5/episodes/2"] = () => new Response(null, { status: 500 });

    await expect(fetchMyEpisode(cookies, "5", "2")).rejects.toThrow("GET /api/my/works/5/episodes/2 failed with 500");
  });
});

describe("findWritingPath", () => {
  test("@AC-F2-5 opens the last draft of my latest work, from the browser", async () => {
    routes["/api/my/works"] = () => Response.json({ data: [{ id: 8 }, { id: 5 }] });
    routes["/api/my/works/8/episodes"] = () =>
      Response.json({ data: [{ ...summaries[1], id: 3 }, summaries[0], { ...summaries[1], id: 4 }, { ...summaries[0], id: 6 }] });

    expect(await findWritingPath()).toBe("/my/works/8/episodes/4/edit");
    expect(calls.map(({ url, credentials, accept }) => ({ url, credentials, accept }))).toEqual([
      { url: "/api/my/works", credentials: "same-origin", accept: "application/json" },
      { url: "/api/my/works/8/episodes", credentials: "same-origin", accept: "application/json" },
    ]);
  });

  test("a work without drafts opens that work", async () => {
    routes["/api/my/works"] = () => Response.json({ data: [{ id: 8 }] });
    routes["/api/my/works/8/episodes"] = () => Response.json({ data: [summaries[0]] });

    expect(await findWritingPath()).toBe("/my/works/8");
  });

  test("without works, or when reading fails, the workspace is opened", async () => {
    routes["/api/my/works"] = () => Response.json({ data: [] });
    expect(await findWritingPath()).toBe("/my");

    routes["/api/my/works"] = () => new Response(null, { status: 500 });
    expect(await findWritingPath()).toBe("/my");

    routes["/api/my/works"] = () => Response.json({ data: [{ id: 8 }] });
    routes["/api/my/works/8/episodes"] = () => new Response(null, { status: 500 });
    expect(await findWritingPath()).toBe("/my/works/8");
  });
});
