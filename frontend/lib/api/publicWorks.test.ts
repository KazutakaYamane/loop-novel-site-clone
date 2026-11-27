import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchPublicEpisode, fetchPublicWork } from "./publicWorks";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("reads a public work without cookies or a cache", async () => {
  const data = { id: 2, title: "海の手帖", episodes: [{ id: 7, title: "第一章" }] };
  fetchMock.mockResolvedValue(Response.json({ data }));

  await expect(fetchPublicWork("21")).resolves.toEqual(data);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://nginx:8080/api/works/21", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
});

test("reads an episode within the given work", async () => {
  const data = { id: 7, title: "第一章", body: "本文" };
  fetchMock.mockResolvedValue(Response.json({ data }));

  await expect(fetchPublicEpisode("21", "72")).resolves.toEqual(data);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://nginx:8080/api/works/21/episodes/72", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
});

test("invalid work and episode IDs do not become API paths", async () => {
  await expect(fetchPublicWork("2?x=3")).resolves.toBeNull();
  await expect(fetchPublicWork("page2")).resolves.toBeNull();
  await expect(fetchPublicEpisode("2a", "7")).resolves.toBeNull();
  await expect(fetchPublicEpisode("2", "../7")).resolves.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("only a 404 is treated as a missing page", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));

  await expect(fetchPublicWork("2")).resolves.toBeNull();
  await expect(fetchPublicEpisode("2", "7")).rejects.toThrow("GET /api/works/2/episodes/7 failed with 503");
});
