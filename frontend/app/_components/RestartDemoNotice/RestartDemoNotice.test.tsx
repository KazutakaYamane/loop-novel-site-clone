import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEMO_SESSION_EXPIRED_EVENT } from "@/lib/api/sessionExpired";
import { RestartDemoNotice } from "./RestartDemoNotice";
import { WatchDemoSession } from "./WatchDemoSession";

const state = vi.hoisted(() => ({
  cookie: "yomikaki_previous_login=encrypted",
  pathname: "/",
  searchParams: new URLSearchParams(),
  router: { refresh: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    has: (name: string) => state.cookie.startsWith(`${name}=`),
    toString: () => state.cookie,
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => state.searchParams,
  useRouter: () => state.router,
}));

beforeEach(() => {
  state.cookie = "yomikaki_previous_login=encrypted";
  state.pathname = "/";
  state.searchParams = new URLSearchParams();
  state.router.refresh.mockClear();
  state.router.replace.mockClear();
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("a valid marker can show the notice even when the session cookie already expired", async () => {
  const response = new Response(null, { status: 401, headers: { "X-Demo-Session-Expired": "1" } });
  const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchApi);

  render(await RestartDemoNotice());
  const notice = screen.getByRole("region", { name: "ログイン状態が解除されました" });
  expect(notice).toHaveTextContent("ヨミカキを使うには、新しいデモを始めてください。");
  expect(screen.getByRole("link", { name: "デモを始め直す" })).toHaveAttribute("href", "/login");
  expect(fetchApi).toHaveBeenCalledExactlyOnceWith("http://nginx:8080/api/user", {
    cache: "no-store", headers: { Accept: "application/json", Cookie: state.cookie },
  });
});

test("a guest with only a session cookie gets no restart notice", async () => {
  state.cookie = "yomikaki_session=guest";
  const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetchApi);

  render(await RestartDemoNotice());

  expect(fetchApi).toHaveBeenCalledOnce();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

test("@AC-F9-4 a guest layout rechecks the cookies on each navigation without starting an anonymous session", async () => {
  state.cookie = "";
  const fetchApi = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchApi);

  const view = render(await RestartDemoNotice());
  expect(state.router.refresh).not.toHaveBeenCalled();

  state.pathname = "/new-arrivals";
  view.rerender(await RestartDemoNotice());
  expect(state.router.refresh).toHaveBeenCalledTimes(1);

  state.searchParams = new URLSearchParams({ page: "2" });
  view.rerender(await RestartDemoNotice());
  expect(state.router.refresh).toHaveBeenCalledTimes(2);

  state.searchParams = new URLSearchParams({ page: "2" });
  view.rerender(await RestartDemoNotice());
  expect(state.router.refresh).toHaveBeenCalledTimes(2);
  expect(fetchApi).not.toHaveBeenCalled();
});

test("an authenticated layout checks again after navigation and refreshes only when expiry is reported", async () => {
  const fetchApi = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ name: "デモ読者 #1" }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 401, headers: { "X-Demo-Session-Expired": "1" } }));
  vi.stubGlobal("fetch", fetchApi);
  const view = render(await RestartDemoNotice());
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(fetchApi).toHaveBeenNthCalledWith(2, "/api/user", expect.objectContaining({
    cache: "no-store", headers: { Accept: "application/json" }, signal: expect.any(AbortSignal),
  }));
  expect(state.router.refresh).not.toHaveBeenCalled();

  state.pathname = "/login";
  view.rerender(<WatchDemoSession />);

  await waitFor(() => expect(state.router.refresh).toHaveBeenCalledOnce());
  expect(fetchApi).toHaveBeenCalledTimes(3);
});

test("an expired operation navigates to the login page or refreshes that page if it is already open", () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 })));
  const view = render(<WatchDemoSession />);

  act(() => window.dispatchEvent(new Event(DEMO_SESSION_EXPIRED_EVENT)));
  expect(state.router.replace).toHaveBeenCalledExactlyOnceWith("/login");
  expect(state.router.refresh).not.toHaveBeenCalled();

  state.pathname = "/login";
  view.rerender(<WatchDemoSession />);
  act(() => window.dispatchEvent(new Event(DEMO_SESSION_EXPIRED_EVENT)));
  expect(state.router.refresh).toHaveBeenCalledOnce();

  view.unmount();
  act(() => window.dispatchEvent(new Event(DEMO_SESSION_EXPIRED_EVENT)));
  expect(state.router.refresh).toHaveBeenCalledOnce();
});
