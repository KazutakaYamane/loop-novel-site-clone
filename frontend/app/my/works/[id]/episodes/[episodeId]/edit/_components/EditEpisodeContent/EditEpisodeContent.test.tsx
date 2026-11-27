import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EditEpisodeContent } from "./EditEpisodeContent";

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
const draft = { id: 2, work_id: 5, title: "第2話 つづき", body: "途中まで", status: "draft", published_at: null };

let workResponse: () => Response;
let episodeResponse: () => Response;
beforeEach(() => {
  workResponse = () => Response.json(work);
  episodeResponse = () => Response.json(draft);
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    if (String(input) === "http://nginx:8080/api/my/works/5") {
      return workResponse();
    }
    if (String(input) === "http://nginx:8080/api/my/works/5/episodes/2") {
      return episodeResponse();
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function open(id: string, episodeId: string) {
  return EditEpisodeContent({ params: Promise.resolve({ id, episodeId }) });
}

test("@AC-F4-2 the owner edits a draft from its saved content", async () => {
  render(await open("5", "2"));

  expect(screen.getByRole("heading", { level: 1, name: "第2話 つづき" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "星を数える旅" })).toHaveAttribute("href", "/my/works/5");
  expect(screen.getByLabelText("エピソードタイトル")).toHaveValue("第2話 つづき");
  expect(screen.getByLabelText("本文")).toHaveValue("途中まで");
  expect(screen.getByRole("button", { name: "公開する" })).toBeEnabled();
});

test("a published episode is shown without an editor", async () => {
  episodeResponse = () => Response.json({ ...draft, status: "published", published_at: "2026-11-27T03:00:00+00:00" });

  render(await open("5", "2"));

  expect(screen.getByRole("heading", { level: 1, name: "第2話 つづき" })).toBeInTheDocument();
  expect(screen.getByText("公開済みのエピソードは編集できません。")).toBeInTheDocument();
  expect(screen.queryByLabelText("本文")).toBeNull();
  expect(screen.getByRole("link", { name: "小説に戻る" })).toHaveAttribute("href", "/my/works/5");
});

test("@AC-F4-7 another user's episode gets no editor", async () => {
  workResponse = () => new Response(null, { status: 403 });
  episodeResponse = () => new Response(null, { status: 403 });

  render(await open("5", "2"));

  expect(screen.getByRole("heading", { level: 1, name: "この小説は編集できません。" })).toBeInTheDocument();
  expect(screen.queryByText("第2話 つづき")).toBeNull();
  expect(screen.queryByLabelText("本文")).toBeNull();
});

test("a missing work or episode is not found", async () => {
  await expect(open("9", "2")).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(open("5", "3")).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(open("5", "abc")).rejects.toThrow("NEXT_NOT_FOUND");
});
