import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { fetchPublicWork, type PublicWork } from "@/lib/api/publicWorks";
import { PublicWorkContent } from "./PublicWorkContent";
import { generateMetadata } from "../(details)/layout";

vi.mock("@/lib/api/publicWorks", () => ({ fetchPublicWork: vi.fn() }));

const params = Promise.resolve({ workId: "4" });
const work: PublicWork = {
  id: 4,
  title: "海の手帖",
  author_name: "灯台の作者",
  catchphrase: "岬から",
  introduction: "灯台の日誌",
  genre: "sf",
  genre_label: "SF",
  tags: ["海"],
  rating_cruel: true,
  rating_violent: true,
  rating_sexual: true,
  serial_status: "completed",
  episodes: [{ id: 10, title: "第一章" }, { id: 16, title: "第二章" }],
};

beforeEach(() => {
  vi.mocked(fetchPublicWork).mockReset();
});

test("shows published work details and links to its published episodes", async () => {
  vi.mocked(fetchPublicWork).mockResolvedValue(work);

  render(await PublicWorkContent({ params }));

  const main = await screen.findByRole("main");
  expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(work.title);
  for (const value of ["灯台の作者", "岬から", "灯台の日誌", "SF", "海", "完結済", "残酷描写有り", "暴力描写有り", "性描写有り"]) {
    expect(within(main).getByText(value, { exact: true })).toBeVisible();
  }
  const links = within(within(main).getByRole("navigation", { name: "目次" })).getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["第一章", "/works/4/episodes/10"],
    ["第二章", "/works/4/episodes/16"],
  ]);
  expect(fetchPublicWork).toHaveBeenCalledWith("4");
});

test("lists the serial status and genre in the details table", async () => {
  vi.mocked(fetchPublicWork).mockResolvedValue(work);

  render(await PublicWorkContent({ params }));

  const details = screen.getByRole("region", { name: "詳細" });
  const terms = within(details).getAllByRole("term").map((term) => term.textContent);
  expect(terms).toEqual(["執筆状況", "ジャンル", "タグ", "セルフレイティング"]);
  const statusValue = within(details).getByText("執筆状況").nextElementSibling;
  expect(statusValue).toHaveTextContent("完結済");
});

test("omits empty optional details and shows the running status", async () => {
  vi.mocked(fetchPublicWork).mockResolvedValue({
    ...work,
    catchphrase: null,
    introduction: null,
    genre_label: null,
    rating_cruel: false,
    rating_violent: false,
    rating_sexual: false,
    serial_status: "running",
    tags: [],
  });
  render(await PublicWorkContent({ params }));

  expect(screen.getByText("連載中")).toBeVisible();
  expect(screen.queryByRole("list", { name: "タグ" })).not.toBeInTheDocument();
  for (const value of ["岬から", "灯台の日誌", "SF", "残酷描写有り", "暴力描写有り", "性描写有り"]) {
    expect(screen.queryByText(value, { exact: true })).not.toBeInTheDocument();
  }
});

test("uses the introduction, then the catchphrase or title for work metadata", async () => {
  const props = { params, children: null };
  vi.mocked(fetchPublicWork)
    .mockResolvedValueOnce(work)
    .mockResolvedValueOnce({ ...work, introduction: null })
    .mockResolvedValueOnce({ ...work, introduction: null, catchphrase: null })
    .mockResolvedValueOnce(null);
  for (const description of ["灯台の日誌", "岬から", "海の手帖"]) {
    await expect(generateMetadata(props)).resolves.toEqual({
      title: "海の手帖",
      openGraph: { title: "海の手帖", description },
    });
  }
  await expect(generateMetadata(props)).resolves.toEqual({});
  expect(fetchPublicWork).toHaveBeenCalledTimes(4);
});

test("a missing work interrupts rendering with a 404", async () => {
  vi.mocked(fetchPublicWork).mockResolvedValue(null);
  await expect(PublicWorkContent({ params })).rejects.toHaveProperty("digest", "NEXT_HTTP_ERROR_FALLBACK;404");
});
