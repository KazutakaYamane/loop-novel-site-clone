import { act, render, screen } from "@testing-library/react";
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

test("an authenticated layout rechecks on the server so a passive check cannot overwrite the browser session", async () => {
  const fetchApi = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ name: "デモ読者 #1" }));
  vi.stubGlobal("fetch", fetchApi);
  const view = render(await RestartDemoNotice());
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(state.router.refresh).not.toHaveBeenCalled();

  state.pathname = "/login";
  view.rerender(<WatchDemoSession />);

  expect(fetchApi).toHaveBeenCalledExactlyOnceWith("http://nginx:8080/api/user", {
    cache: "no-store", headers: { Accept: "application/json", Cookie: state.cookie },
  });
  expect(state.router.refresh).toHaveBeenCalledOnce();
});

test("an expired operation navigates to the login page or refreshes that page if it is already open", () => {
  const view = render(<WatchDemoSession />);

  act(() => window.dispatchEvent(new Event(DEMO_SESSION_EXPIRED_EVENT)));
  expect(state.router.replace).toHaveBeenCalledExactlyOnceWith("/login");
  expect(state.router.refresh).not.toHaveBeenCalled();
  view.unmount();

  state.pathname = "/login";
  const loginView = render(<WatchDemoSession />);
  act(() => window.dispatchEvent(new Event(DEMO_SESSION_EXPIRED_EVENT)));
  expect(state.router.refresh).toHaveBeenCalledOnce();

  loginView.unmount();
  act(() => window.dispatchEvent(new Event(DEMO_SESSION_EXPIRED_EVENT)));
  expect(state.router.refresh).toHaveBeenCalledOnce();
});
