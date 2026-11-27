import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DemoLoginButtons } from "./DemoLoginButtons";

const visited: string[] = [];
vi.mock("@/lib/navigation", () => ({
  navigateTo: (path: string) => {
    visited.push(path);
  },
}));

// ログインした後に読む API は、デモ作者の初期の作品と話を返す
const requested: string[] = [];
beforeEach(() => {
  visited.length = 0;
  requested.length = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    requested.push(String(input));
    switch (String(input)) {
      case "/api/csrf-token":
        return Response.json({ token: "t" });
      case "/api/demo-sessions":
        return Response.json({ name: "デモ作者 #1" }, { status: 201 });
      case "/api/my/works":
        return Response.json({ data: [{ id: 8 }] });
      case "/api/my/works/8/episodes":
        return Response.json({
          data: [
            { id: 11, title: "第1話", status: "published", published_at: "2026-11-27T03:00:00+00:00" },
            { id: 12, title: "第2話", status: "draft", published_at: null },
          ],
        });
      default:
        return new Response(null, { status: 404 });
    }
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("@AC-F2-5 the demo author moves to the writing screen of the draft", async () => {
  render(<DemoLoginButtons />);

  await userEvent.click(screen.getByRole("button", { name: "デモ作者として始める" }));

  await waitFor(() => expect(visited).toEqual(["/my/works/8/episodes/12/edit"]));
});

test("@AC-F2-6 the demo reader still moves to the top page without reading works", async () => {
  render(<DemoLoginButtons />);

  await userEvent.click(screen.getByRole("button", { name: "デモ読者として始める" }));

  await waitFor(() => expect(visited).toEqual(["/"]));
  expect(requested).toEqual(["/api/csrf-token", "/api/demo-sessions"]);
});
