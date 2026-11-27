import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import WorkPage, { metadata } from "./page";

// 中身は WorkContent.test.tsx が確かめる。ここではページが URL の ID を渡すことだけを見る
const received = vi.hoisted((): Promise<{ id: string }>[] => []);
vi.mock("./_components/WorkContent/WorkContent", () => ({
  WorkContent: ({ params }: { params: Promise<{ id: string }> }) => {
    received.push(params);
    return <p>作品の画面</p>;
  },
}));

test("@AC-F3-2 the work page shows the work of the id in the url", async () => {
  render(<WorkPage params={Promise.resolve({ id: "5" })} searchParams={Promise.resolve({})} />);

  expect(await screen.findByText("作品の画面")).toBeInTheDocument();
  await expect(received[0]).resolves.toEqual({ id: "5" });
  expect(metadata.title).toBe("小説 | ヨミカキ");
});
