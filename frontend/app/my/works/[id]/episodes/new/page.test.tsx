import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import NewEpisodePage, { metadata } from "./page";

// 中身は NewEpisodeContent.test.tsx が確かめる。ここではページが URL の ID を渡すことだけを見る
const received = vi.hoisted((): Promise<{ id: string }>[] => []);
vi.mock("./_components/NewEpisodeContent/NewEpisodeContent", () => ({
  NewEpisodeContent: ({ params }: { params: Promise<{ id: string }> }) => {
    received.push(params);
    return <p>新しいエピソード</p>;
  },
}));

test("@AC-F4-1 the new episode page writes in the work of the id in the url", async () => {
  render(<NewEpisodePage params={Promise.resolve({ id: "5" })} searchParams={Promise.resolve({})} />);

  expect(await screen.findByText("新しいエピソード")).toBeInTheDocument();
  await expect(received[0]).resolves.toEqual({ id: "5" });
  expect(metadata.title).toBe("エピソードを作成 | ヨミカキ");
});
