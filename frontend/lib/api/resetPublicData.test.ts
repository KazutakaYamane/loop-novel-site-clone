import { afterEach, expect, test, vi } from "vitest";
import { fetchNewArrivals } from "./newArrivals";
import { fetchPublicEpisode, fetchPublicWork } from "./publicWorks";

vi.mock("next/server", () => ({ connection: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("@AC-F9-3 reads the current arrivals, work and episode after the API resets its data", async () => {
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  const demo = { id: 3, title: "リセット前の作品" };
  const seed = { id: 1, title: "シードの作品" };
  let reset = false;
  const fetchApi = vi.fn<typeof fetch>(async (input, options) => {
    expect(options?.cache).toBe("no-store");
    const path = new URL(String(input)).pathname;
    if (path === "/api/new-arrivals") {
      return Response.json({
        data: reset ? [seed] : [demo, seed], links: { next: null }, meta: { current_page: 1 },
      });
    }
    const work = reset ? seed : demo;
    if (path === `/api/works/${work.id}`) {
      return Response.json({ data: work });
    }
    if (path === `/api/works/${work.id}/episodes/2`) {
      return Response.json({ data: { id: 2, work, title: work.title } });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchApi);

  expect((await fetchNewArrivals(1)).works).toEqual([demo, seed]);
  await expect(fetchPublicWork("3")).resolves.toEqual(demo);
  await expect(fetchPublicEpisode("3", "2")).resolves.toMatchObject({ work: demo });

  reset = true;

  expect((await fetchNewArrivals(1)).works).toEqual([seed]);
  await expect(fetchPublicWork("3")).resolves.toBeNull();
  await expect(fetchPublicEpisode("3", "2")).resolves.toBeNull();
  await expect(fetchPublicWork("1")).resolves.toEqual(seed);
  await expect(fetchPublicEpisode("1", "2")).resolves.toMatchObject({ work: seed });
});
