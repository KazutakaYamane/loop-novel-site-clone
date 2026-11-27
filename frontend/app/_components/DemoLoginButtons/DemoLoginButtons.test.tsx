import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DemoLoginButtons } from "./DemoLoginButtons";

// ページの移動を、移動した先を覚えるだけの実装に置き換える
const visited: string[] = [];
vi.mock("@/lib/navigation", () => ({
  navigateTo: (path: string) => {
    visited.push(path);
  },
}));

type Posted = { role: string };

// Laravel の CSRF トークンとデモログインの API を、1 つのセッションの状態で真似る
function fakeLaravel(posted: Posted[], demoStatus: number, gate?: Promise<void>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (String(input) === "/api/csrf-token") {
      return Response.json({ token: "t" });
    }
    if (String(input) === "/api/demo-sessions" && init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)));
      await gate;
      return Response.json({ name: "x" }, { status: demoStatus });
    }
    return new Response(null, { status: 404 });
  };
}

describe("DemoLoginButtons", () => {
  let posted: Posted[];

  beforeEach(() => {
    posted = [];
    visited.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("@AC-F2-1 shows the demo author and demo reader buttons", () => {
    render(<DemoLoginButtons />);

    expect(screen.getByRole("button", { name: "デモ作者として始める" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "デモ読者として始める" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("@AC-F2-6 the reader button logs in as a reader and goes to the top page", async () => {
    vi.stubGlobal("fetch", fakeLaravel(posted, 201));
    render(<DemoLoginButtons />);

    await userEvent.click(screen.getByRole("button", { name: "デモ読者として始める" }));

    await waitFor(() => expect(visited).toEqual(["/"]));
    expect(posted).toEqual([{ role: "reader" }]);
  });

  test("@AC-F2-2 the author button logs in as an author", async () => {
    vi.stubGlobal("fetch", fakeLaravel(posted, 201));
    render(<DemoLoginButtons />);

    await userEvent.click(screen.getByRole("button", { name: "デモ作者として始める" }));

    await waitFor(() => expect(visited).toHaveLength(1));
    expect(posted).toEqual([{ role: "author" }]);
  });

  test("both buttons are disabled while a demo is starting", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", fakeLaravel(posted, 201, gate));
    render(<DemoLoginButtons />);

    await userEvent.click(screen.getByRole("button", { name: "デモ読者として始める" }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(screen.getByRole("button", { name: "デモ作者として始める" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "デモ読者として始める" })).toBeDisabled();
    release();
    await waitFor(() => expect(visited).toEqual(["/"]));
  });

  test("a failure is shown and the buttons can be pressed again", async () => {
    vi.stubGlobal("fetch", fakeLaravel(posted, 500));
    render(<DemoLoginButtons />);

    await userEvent.click(screen.getByRole("button", { name: "デモ読者として始める" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("デモを始められませんでした");
    expect(visited).toEqual([]);
    expect(screen.getByRole("button", { name: "デモ読者として始める" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "デモ作者として始める" })).toBeEnabled();
  });

  test("pressing again after a failure clears the failure message", async () => {
    vi.stubGlobal("fetch", fakeLaravel(posted, 500));
    render(<DemoLoginButtons />);
    await userEvent.click(screen.getByRole("button", { name: "デモ読者として始める" }));
    await screen.findByRole("alert");

    vi.stubGlobal("fetch", fakeLaravel(posted, 201));
    await userEvent.click(screen.getByRole("button", { name: "デモ読者として始める" }));

    await waitFor(() => expect(visited).toEqual(["/"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
