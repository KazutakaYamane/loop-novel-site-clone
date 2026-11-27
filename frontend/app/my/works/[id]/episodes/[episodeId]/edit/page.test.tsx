import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import EditEpisodePage, { metadata } from "./page";

// 中身は EditEpisodeContent.test.tsx が確かめる。ここではページが URL の ID を渡すことだけを見る
const received = vi.hoisted((): Promise<{ id: string; episodeId: string }>[] => []);
vi.mock("./_components/EditEpisodeContent/EditEpisodeContent", () => ({
  EditEpisodeContent: ({ params }: { params: Promise<{ id: string; episodeId: string }> }) => {
    received.push(params);
    return <p>エピソードの執筆</p>;
  },
}));

test("@AC-F4-2 the editor page edits the episode of the ids in the url", async () => {
  render(<EditEpisodePage params={Promise.resolve({ id: "5", episodeId: "2" })} searchParams={Promise.resolve({})} />);

  expect(await screen.findByText("エピソードの執筆")).toBeInTheDocument();
  await expect(received[0]).resolves.toEqual({ id: "5", episodeId: "2" });
  expect(metadata.title).toBe("エピソードの執筆 | ヨミカキ");
});
