import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createEpisode, publishEpisode, saveEpisode } from "./episodeMutations";

const saved = { id: 2, work_id: 5, title: "第2話", body: "本文", status: "draft", published_at: null };

let sent: { url: string; method?: string; token: string | null; accept: string | null; contentType: string | null; credentials?: RequestCredentials; body: unknown }[];
function stubLaravel(respond: () => Response, csrf: Response = Response.json({ token: "csrf-token" })) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/csrf-token") {
      return csrf;
    }
    const headers = new Headers(init?.headers);
    sent.push({
      url: String(input),
      method: init?.method,
      token: headers.get("X-CSRF-TOKEN"),
      accept: headers.get("Accept"),
      contentType: headers.get("Content-Type"),
      credentials: init?.credentials,
      body: JSON.parse(String(init?.body)),
    });
    return respond();
  });
}

beforeEach(() => {
  sent = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const input = { title: "第2話", body: "本文" };

test("@AC-F4-1 a new episode is saved as a draft of the work with the csrf token", async () => {
  stubLaravel(() => Response.json(saved, { status: 201 }));

  expect(await createEpisode(5, input)).toEqual({ ok: true, episode: saved });
  expect(sent).toEqual([
    {
      url: "/api/my/works/5/episodes",
      method: "POST",
      token: "csrf-token",
      accept: "application/json",
      contentType: "application/json",
      credentials: "same-origin",
      body: input,
    },
  ]);
});

test("@AC-F4-2 a draft is saved again in place", async () => {
  stubLaravel(() => Response.json(saved));

  expect(await saveEpisode(5, 2, input)).toEqual({ ok: true, episode: saved });
  expect(sent[0]).toMatchObject({ url: "/api/my/works/5/episodes/2", method: "PUT", token: "csrf-token", body: input });
});

test("@AC-F4-6 publishing sends the content in the form", async () => {
  const published = { ...saved, status: "published", published_at: "2026-11-27T03:00:00+00:00" };
  stubLaravel(() => Response.json(published));

  expect(await publishEpisode(5, 2, input)).toEqual({ ok: true, episode: published });
  expect(sent[0]).toMatchObject({ url: "/api/my/works/5/episodes/2/publication", method: "POST", token: "csrf-token", body: input });
});

test("@AC-F4-6 Laravel's message for an empty body is returned by field", async () => {
  stubLaravel(() =>
    Response.json({ message: "x", errors: { body: ["本文が空のエピソードは公開できません。"] } }, { status: 422 }),
  );

  expect(await publishEpisode(5, 2, { title: "第2話", body: "" })).toEqual({
    ok: false,
    errors: { body: ["本文が空のエピソードは公開できません。"] },
  });
});

test("@AC-F4-7 a refused change says the episode cannot be edited", async () => {
  stubLaravel(() => new Response(null, { status: 403 }));

  expect(await saveEpisode(5, 2, input)).toEqual({ ok: false, errors: { form: ["このエピソードは編集できません。"] } });
});

test("a published episode cannot be saved again", async () => {
  stubLaravel(() => Response.json({ message: "公開済みのエピソードは編集できません。" }, { status: 409 }));

  expect(await saveEpisode(5, 2, input)).toEqual({ ok: false, errors: { form: ["公開済みのエピソードは編集できません。"] } });
});

test("other failures ask to try again, and nothing is sent without a csrf token", async () => {
  const retry = { ok: false, errors: { form: ["保存できませんでした。時間をおいてもう一度お試しください。"] } };
  stubLaravel(() => new Response(null, { status: 500 }));
  expect(await createEpisode(5, input)).toEqual(retry);

  sent = [];
  stubLaravel(() => Response.json(saved), new Response(null, { status: 500 }));
  expect(await publishEpisode(5, 2, input)).toEqual(retry);
  expect(sent).toEqual([]);
});
