import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import EditWorkPage, { metadata } from "./page";

// 中身は EditWorkContent.test.tsx が確かめる。ここではページが URL の ID を渡すことだけを見る
const received = vi.hoisted((): Promise<{ id: string }>[] => []);
vi.mock("./_components/EditWorkContent/EditWorkContent", () => ({
  EditWorkContent: ({ params }: { params: Promise<{ id: string }> }) => {
    received.push(params);
    return <p>作品の設定</p>;
  },
}));

test("@AC-F3-2 the settings page edits the work of the id in the url", async () => {
  render(<EditWorkPage params={Promise.resolve({ id: "5" })} searchParams={Promise.resolve({})} />);

  expect(await screen.findByText("作品の設定")).toBeInTheDocument();
  await expect(received[0]).resolves.toEqual({ id: "5" });
  expect(metadata.title).toBe("小説の設定 | ヨミカキ");
});
