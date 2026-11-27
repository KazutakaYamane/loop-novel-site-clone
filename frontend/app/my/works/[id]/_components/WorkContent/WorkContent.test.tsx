import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Work } from "@/lib/api/works";
import { WorkContent } from "./WorkContent";

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "yomikaki_session=mine" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const work: Work = {
  id: 5,
  title: "星を数える旅",
  catchphrase: "夜空の一行",
  introduction: "一行目\n二行目",
  genre: "sf",
  tags: ["宇宙", "旅"],
  rating_cruel: true,
  rating_violent: false,
  rating_sexual: true,
  serial_status: "completed",
};

// Laravel の作品とジャンルの API を、決めた状態で返す
let workResponse: () => Response;
beforeEach(() => {
  workResponse = () => Response.json(work);
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    if (String(input) === "http://nginx:8080/api/my/works/5") {
      return workResponse();
    }
    if (String(input) === "http://nginx:8080/api/genres") {
      return Response.json({ data: [{ value: "sf", label: "SF" }] });
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function open(id: string) {
  return WorkContent({ params: Promise.resolve({ id }) });
}

test("@AC-F3-2 the work page shows every setting of my work", async () => {
  render(await open("5"));

  expect(screen.getByRole("heading", { level: 1, name: "星を数える旅" })).toBeInTheDocument();
  const details = screen.getByTestId("work-details");
  const value = (term: string) => within(details).getByText(term, { selector: "dt" }).nextElementSibling;
  expect(value("連載状態")).toHaveTextContent("完結済");
  expect(value("ジャンル")).toHaveTextContent("SF");
  expect(value("キャッチコピー")).toHaveTextContent("夜空の一行");
  expect(value("紹介文")).toHaveTextContent("一行目 二行目");
  expect(value("セルフレイティング")).toHaveTextContent("残酷描写有り性描写有り");
  expect(value("タグ")).toHaveTextContent("宇宙旅");
  expect(screen.getByRole("link", { name: "小説の設定を編集" })).toHaveAttribute("href", "/my/works/5/edit");
});

test("unset settings are shown as not set", async () => {
  workResponse = () =>
    Response.json({ ...work, catchphrase: null, introduction: null, genre: null, tags: [], rating_cruel: false, rating_sexual: false });

  render(await open("5"));

  const details = screen.getByTestId("work-details");
  for (const term of ["ジャンル", "キャッチコピー", "紹介文", "セルフレイティング", "タグ"]) {
    expect(within(details).getByText(term, { selector: "dt" }).nextElementSibling).toHaveTextContent("未設定");
  }
});

test("@AC-F3-4 another user's work is not shown", async () => {
  workResponse = () => Response.json({ message: "This action is unauthorized." }, { status: 403 });

  render(await open("5"));

  expect(screen.getByRole("heading", { level: 1, name: "この小説は編集できません。" })).toBeInTheDocument();
  expect(screen.queryByText("星を数える旅")).toBeNull();
  expect(screen.queryByRole("link", { name: "小説の設定を編集" })).toBeNull();
});

test("a work that does not exist is not found", async () => {
  await expect(open("9")).rejects.toThrow("NEXT_NOT_FOUND");
});
