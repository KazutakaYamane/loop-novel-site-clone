import { afterEach, expect, test, vi } from "vitest";
import { logOut } from "@/lib/auth/logout";
import { startDemo } from "@/lib/auth/startDemo";
import { fetchCsrfToken } from "./csrfToken";
import { saveEpisode } from "./episodeMutations";
import { DEMO_SESSION_EXPIRED_EVENT, isDemoSessionExpired } from "./sessionExpired";
import { createWork } from "./workMutations";

const expiryHeaders = { "X-Demo-Session-Expired": "1" };

afterEach(() => vi.unstubAllGlobals());

test("recognizes only the API's expired session flag", () => {
  expect(isDemoSessionExpired(new Response(null, { headers: expiryHeaders }))).toBe(true);
  expect(isDemoSessionExpired(new Response(null, { status: 401 }))).toBe(false);
  expect(isDemoSessionExpired(new Response(null, { headers: { "X-Demo-Session-Expired": "0" } }))).toBe(false);
});

test("a stale CSRF lookup redirects an open form but lets a user start a fresh demo", async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  const fetchApi = vi.fn<typeof fetch>().mockImplementation(async (input) =>
    input === "/api/csrf-token"
      ? Response.json({ token: "guest-token" }, { headers: expiryHeaders })
      : new Response(null, { status: 201 }),
  );
  vi.stubGlobal("fetch", fetchApi);

  await expect(fetchCsrfToken()).resolves.toBeNull();
  expect(fetchApi).toHaveBeenCalledWith("/api/csrf-token", expect.objectContaining({ cache: "no-store" }));
  expect(dispatchEvent).toHaveBeenCalledOnce();
  expect(dispatchEvent.mock.calls[0][0]).toHaveProperty("type", DEMO_SESSION_EXPIRED_EVENT);

  dispatchEvent.mockClear();
  await expect(startDemo("reader")).resolves.toBe(true);
  expect(fetchApi).toHaveBeenLastCalledWith("/api/demo-sessions", expect.objectContaining({
    headers: expect.objectContaining({ "X-CSRF-TOKEN": "guest-token" }),
  }));
  expect(dispatchEvent).not.toHaveBeenCalled();
});

test.each([
  ["episode save", () => saveEpisode(1, 2, { title: "話", body: "本文" })],
  ["work creation", () => createWork({ title: "作品", introduction: "" })],
  ["logout", () => logOut()],
] satisfies [string, () => Promise<unknown>][])("a session expiring during %s still redirects to login", async (_label, submit) => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  const fetchApi = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ token: "old-token" }))
    .mockResolvedValueOnce(new Response(null, { status: 419, headers: expiryHeaders }));
  vi.stubGlobal("fetch", fetchApi);

  const result = await submit();

  expect(fetchApi).toHaveBeenCalledTimes(2);
  expect(dispatchEvent).toHaveBeenCalledOnce();
  expect(dispatchEvent.mock.calls[0][0]).toHaveProperty("type", DEMO_SESSION_EXPIRED_EVENT);
  if (typeof result !== "boolean") {
    expect(result).toMatchObject({ ok: false, errors: { form: [expect.any(String)] } });
  } else {
    expect(result).toBe(false);
  }
});
