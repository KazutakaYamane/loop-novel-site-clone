import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Work } from "@/lib/api/works";
import { EditWorkContent } from "./EditWorkContent";

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "yomikaki_session=mine" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
// フォームの中身は WorkSettingsForm.test.tsx が確かめる。ここでは渡す値だけを見る
vi.mock("../WorkSettingsForm/WorkSettingsForm", () => ({
  WorkSettingsForm: ({ work, genres }: { work: Work; genres: { label: string }[] }) => (
    <p>
      {work.title}の設定({genres.map((genre) => genre.label).join("、")})
    </p>
  ),
}));

const work: Work = {
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
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    if (String(input) === "http://nginx:8080/api/my/works/5") {
      return workResponse();
    }
    if (String(input) === "http://nginx:8080/api/genres") {
      return Response.json({ data: [{ value: "sf", label: "SF" }, { value: "horror", label: "ホラー" }] });
    }
    return new Response(null, { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function open(id: string) {
  return EditWorkContent({ params: Promise.resolve({ id }) });
}

test("@AC-F3-2 the settings page opens the form for my work with the genre choices", async () => {
  render(await open("5"));

  expect(screen.getByRole("heading", { level: 1, name: "編集" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "星を数える旅" })).toHaveAttribute("href", "/my/works/5");
  expect(screen.getByText("星を数える旅の設定(SF、ホラー)")).toBeInTheDocument();
});

test("@AC-F3-4 another user's work cannot be edited", async () => {
  workResponse = () => Response.json({ message: "This action is unauthorized." }, { status: 403 });

  render(await open("5"));

  expect(screen.getByRole("heading", { level: 1, name: "この小説は編集できません。" })).toBeInTheDocument();
  expect(screen.queryByText(/の設定/)).toBeNull();
});

test("a work that does not exist is not found", async () => {
  await expect(open("9")).rejects.toThrow("NEXT_NOT_FOUND");
});
