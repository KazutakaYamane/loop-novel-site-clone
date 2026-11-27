import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NewEpisodeContent } from "./NewEpisodeContent";

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "yomikaki_session=mine" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const work = {
  id: 5,
  title: "星を数える旅",
  catchphrase: null,
  introduction: null,
  genre: null,
  tags: [],
  rating_cruel: false,
  rating_violent: false,
  rating_sexual: false,
  serial_status: "running",
};

let workResponse: () => Response;
beforeEach(() => {
  workResponse = () => Response.json(work);
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) =>
    String(input) === "http://nginx:8080/api/my/works/5" ? workResponse() : new Response(null, { status: 404 }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function open(id: string) {
  return NewEpisodeContent({ params: Promise.resolve({ id }) });
}

test("@AC-F4-1 the owner gets an empty editor for a new episode of the work", async () => {
  render(await open("5"));

  expect(screen.getByRole("heading", { level: 1, name: "エピソードを作成" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "星を数える旅" })).toHaveAttribute("href", "/my/works/5");
  expect(screen.getByLabelText("エピソードタイトル")).toHaveValue("");
  expect(screen.getByLabelText("本文")).toHaveValue("");
  expect(screen.getByRole("button", { name: "下書き保存" })).toBeEnabled();
});

test("@AC-F4-7 another user's work gets no editor", async () => {
  workResponse = () => new Response(null, { status: 403 });

  render(await open("5"));

  expect(screen.getByRole("heading", { level: 1, name: "この小説は編集できません。" })).toBeInTheDocument();
  expect(screen.queryByLabelText("本文")).toBeNull();
});

test("a work that does not exist is not found", async () => {
  await expect(open("9")).rejects.toThrow("NEXT_NOT_FOUND");
});
