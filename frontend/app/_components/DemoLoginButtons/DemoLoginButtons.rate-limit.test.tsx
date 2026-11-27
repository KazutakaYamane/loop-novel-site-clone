import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DemoLoginButtons } from "./DemoLoginButtons";

const visited: string[] = [];
vi.mock("@/lib/navigation", () => ({
  navigateTo: (path: string) => {
    visited.push(path);
  },
}));

// デモログインの API が返す状態を、押すたびに順に返す
function fakeLaravel(statuses: number[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (String(input) === "/api/csrf-token") {
      return Response.json({ token: "t" });
    }
    if (String(input) === "/api/demo-sessions" && init?.method === "POST") {
      return Response.json({ message: "x" }, { status: statuses.shift() ?? 500 });
    }
    return new Response(null, { status: 404 });
  };
}

const limitMessage = "デモを始められる回数の上限に達しました。1時間ほどおいてからもう一度お試しください。";

describe("DemoLoginButtons and the demo login limit @AC-F2-7", () => {
  beforeEach(() => {
    visited.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const variant of ["page", "header"] as const) {
    test(`the ${variant} buttons tell the user the limit was reached`, async () => {
      vi.stubGlobal("fetch", fakeLaravel([429]));
      render(<DemoLoginButtons variant={variant} />);

      await userEvent.click(screen.getByRole("button", { name: "デモ読者として始める" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(limitMessage);
      expect(visited).toEqual([]);
      expect(screen.getByRole("button", { name: "デモ読者として始める" })).toBeEnabled();
    });
  }

  test("other failures keep the general message", async () => {
    vi.stubGlobal("fetch", fakeLaravel([500]));
    render(<DemoLoginButtons />);

    await userEvent.click(screen.getByRole("button", { name: "デモ作者として始める" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("デモを始められませんでした。時間をおいてもう一度お試しください。");
    expect(alert).not.toHaveTextContent("上限");
  });

  test("the limit message goes away when a later attempt fails for another reason or succeeds", async () => {
    vi.stubGlobal("fetch", fakeLaravel([429, 500, 201]));
    render(<DemoLoginButtons />);
    const reader = screen.getByRole("button", { name: "デモ読者として始める" });

    await userEvent.click(reader);
    expect(await screen.findByRole("alert")).toHaveTextContent(limitMessage);

    await userEvent.click(reader);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("デモを始められませんでした"));

    await userEvent.click(reader);
    await waitFor(() => expect(visited).toEqual(["/"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
