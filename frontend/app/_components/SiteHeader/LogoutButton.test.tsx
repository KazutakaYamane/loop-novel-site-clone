import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LogoutButton } from "./LogoutButton";

// ページの移動を、移動した先を覚えるだけの実装に置き換える
const visited: string[] = [];
vi.mock("@/lib/navigation", () => ({
  navigateTo: (path: string) => {
    visited.push(path);
  },
}));

// ログアウトの API を、呼ばれた回数と返す状態で真似る
function fakeLaravel(calls: string[], logoutStatus: number, gate?: Promise<void>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (String(input) === "/api/csrf-token") {
      return Response.json({ token: "t" });
    }
    if (String(input) === "/api/session" && init?.method === "DELETE") {
      calls.push("logout");
      await gate;
      return new Response(null, { status: logoutStatus });
    }
    return new Response(null, { status: 404 });
  };
}

let calls: string[];

beforeEach(() => {
  calls = [];
  visited.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("@AC-F1-1 logging out moves to the top page so it is shown as a guest", async () => {
  vi.stubGlobal("fetch", fakeLaravel(calls, 204));
  render(<LogoutButton />);

  await userEvent.click(screen.getByRole("button", { name: "ログアウト" }));

  await waitFor(() => expect(visited).toEqual(["/"]));
  expect(calls).toEqual(["logout"]);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the button cannot be pressed twice while logging out", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("fetch", fakeLaravel(calls, 204, gate));
  render(<LogoutButton />);

  await userEvent.click(screen.getByRole("button", { name: "ログアウト" }));

  await waitFor(() => expect(screen.getByRole("button", { name: "ログアウト" })).toBeDisabled());
  release();
  await waitFor(() => expect(visited).toEqual(["/"]));
  expect(calls).toEqual(["logout"]);
});

test("a failed logout stays on the page and says so", async () => {
  vi.stubGlobal("fetch", fakeLaravel(calls, 500));
  render(<LogoutButton />);

  await userEvent.click(screen.getByRole("button", { name: "ログアウト" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("ログアウトできませんでした。時間をおいてもう一度お試しください。");
  expect(visited).toEqual([]);
  expect(screen.getByRole("button", { name: "ログアウト" })).toBeEnabled();
});

test("no failure message is shown before the button is pressed", () => {
  render(<LogoutButton />);

  expect(screen.getByRole("button", { name: "ログアウト" })).toBeEnabled();
  expect(screen.queryByRole("alert")).toBeNull();
});
