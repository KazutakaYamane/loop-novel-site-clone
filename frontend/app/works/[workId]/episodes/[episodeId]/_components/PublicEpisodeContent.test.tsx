import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { fetchPublicEpisode, type PublicEpisode } from "@/lib/api/publicWorks";
import { PublicEpisodeContent } from "./PublicEpisodeContent";
import { generateMetadata } from "../layout";

vi.mock("@/lib/api/publicWorks", () => ({ fetchPublicEpisode: vi.fn() }));

const params = Promise.resolve({ workId: "4", episodeId: "12" });
const episode: PublicEpisode = {
  id: 12,
  title: "第二章",
  work: { id: 4, title: "海の手帖", introduction: "灯台の日誌" },
  body: "\n　本文\n\n<b>文字</b>\n",
  previous_id: 10,
  next_id: 16,
};

beforeEach(() => {
  vi.mocked(fetchPublicEpisode).mockReset();
});

test("shows the work, the episode, and links to the adjacent episodes", async () => {
  vi.mocked(fetchPublicEpisode).mockResolvedValue(episode);
  render(await PublicEpisodeContent({ params }));

  const main = await screen.findByRole("main");
  const body = within(main).getByTestId("episode-body");
  expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent("第二章");
  expect(within(main).getByRole("link", { name: "海の手帖" })).toHaveAttribute("href", "/works/4");
  expect(body.textContent).toBe(episode.body);
  expect(body.querySelector("b")).toBeNull();
  const links = within(within(main).getByRole("navigation")).getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["前の話", "/works/4/episodes/10"],
    ["目次", "/works/4"],
    ["次の話", "/works/4/episodes/16"],
  ]);
  expect(fetchPublicEpisode).toHaveBeenCalledWith("4", "12");
});

test("an episode without neighbors links only to the contents", async () => {
  vi.mocked(fetchPublicEpisode).mockResolvedValue({ ...episode, previous_id: null, next_id: null });
  render(await PublicEpisodeContent({ params }));

  const links = within(screen.getByRole("navigation")).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual(["目次"]);
});

test("uses the episode and work titles and the introduction in metadata", async () => {
  const props = { params, children: null };
  vi.mocked(fetchPublicEpisode)
    .mockResolvedValueOnce(episode)
    .mockResolvedValueOnce({ ...episode, work: { ...episode.work, introduction: null } })
    .mockResolvedValueOnce(null);
  for (const description of ["灯台の日誌", "第二章 - 海の手帖"]) {
    await expect(generateMetadata(props)).resolves.toEqual({
      title: "第二章 - 海の手帖",
      openGraph: { title: "第二章 - 海の手帖", description },
    });
  }
  await expect(generateMetadata(props)).resolves.toEqual({});
  expect(fetchPublicEpisode).toHaveBeenCalledTimes(3);
});

test("a missing episode interrupts rendering with a 404", async () => {
  vi.mocked(fetchPublicEpisode).mockResolvedValue(null);
  await expect(PublicEpisodeContent({ params })).rejects.toHaveProperty("digest", "NEXT_HTTP_ERROR_FALLBACK;404");
});
