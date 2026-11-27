import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LoginGate } from "./layout";

// redirect は例外で描画を止める。移動先を覚えて同じく止める
const redirected: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirected.push(path);
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));

// リクエストの cookie を、テストごとに決めたセッションで返す
let sessionCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    has: (name: string) => name === "yomikaki_session" && sessionCookie !== undefined,
    toString: () => (sessionCookie === undefined ? "" : `yomikaki_session=${sessionCookie}`),
  }),
}));

// Laravel の GET /api/user を、ログイン中のセッション 1 つで真似る
beforeEach(() => {
  redirected.length = 0;
  sessionCookie = undefined;
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const cookie = new Headers(init?.headers).get("Cookie") ?? "";
    if (String(input) === "http://nginx:8080/api/user" && cookie === "yomikaki_session=logged-in") {
      return Response.json({ name: "デモ作者 #3" });
    }
    return Response.json({ message: "Unauthenticated." }, { status: 401 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("@AC-F1-2 a guest without a session is sent to the login page", async () => {
  await expect(LoginGate({ children: <p>ワークスペースの中身</p> })).rejects.toThrow("NEXT_REDIRECT");

  expect(redirected).toEqual(["/login"]);
});

test("@AC-F1-1 a session that is no longer logged in is sent to the login page", async () => {
  sessionCookie = "logged-out";

  await expect(LoginGate({ children: <p>ワークスペースの中身</p> })).rejects.toThrow("NEXT_REDIRECT");

  expect(redirected).toEqual(["/login"]);
});

test("a logged-in user sees the page", async () => {
  sessionCookie = "logged-in";

  render(await LoginGate({ children: <p>ワークスペースの中身</p> }));

  expect(screen.getByText("ワークスペースの中身")).toBeInTheDocument();
  expect(redirected).toEqual([]);
});
