import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createWork, updateWork, type WorkSettings } from "./workMutations";

const saved = {
  id: 7,
  title: "星を数える旅",
  catchphrase: null,
  introduction: "紹介文",
  genre: null,
  tags: [],
  rating_cruel: false,
  rating_violent: false,
  rating_sexual: false,
  serial_status: "running",
};

const settings: WorkSettings = {
  title: "星を数える旅",
  catchphrase: "一行",
  introduction: "紹介文",
  genre: "sf",
  tags: ["宇宙"],
  rating_cruel: true,
  rating_violent: false,
  rating_sexual: false,
  serial_status: "completed",
};

// CSRF トークンと作品の API を真似て、送られたリクエストを覚える
let sent: { url: string; method?: string; token: string | null; body: unknown }[];
let types: { accept: string | null; contentType: string | null }[];
function stubLaravel(respond: () => Response, csrf: Response = Response.json({ token: "csrf-token" })) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/csrf-token") {
      return csrf;
    }
    const headers = new Headers(init?.headers);
    types.push({ accept: headers.get("Accept"), contentType: headers.get("Content-Type") });
    sent.push({
      url: String(input),
      method: init?.method,
      token: new Headers(init?.headers).get("X-CSRF-TOKEN"),
      body: JSON.parse(String(init?.body)),
    });
    return respond();
  });
}

beforeEach(() => {
  sent = [];
  types = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("@AC-F3-1 a work is created with the title and the introduction", async () => {
  stubLaravel(() => Response.json(saved, { status: 201 }));

  await expect(createWork({ title: "星を数える旅", introduction: "紹介文" })).resolves.toEqual({ ok: true, work: saved });

  expect(sent).toEqual([
    { url: "/api/my/works", method: "POST", token: "csrf-token", body: { title: "星を数える旅", introduction: "紹介文" } },
  ]);
});

test("@AC-F3-2 the settings are sent to the work", async () => {
  stubLaravel(() => Response.json(saved));

  await expect(updateWork(7, settings)).resolves.toEqual({ ok: true, work: saved });

  expect(sent).toEqual([{ url: "/api/my/works/7", method: "PUT", token: "csrf-token", body: settings }]);
  expect(types).toEqual([{ accept: "application/json", contentType: "application/json" }]);
});

test("@AC-F3-3 the messages for each field are returned when laravel rejects the input", async () => {
  const errors = { catchphrase: ["キャッチコピーは35文字以内で入力してください。"] };
  stubLaravel(() => Response.json({ message: "invalid", errors }, { status: 422 }));

  await expect(updateWork(7, settings)).resolves.toEqual({ ok: false, errors });
});

test("@AC-F3-4 a change to another user's work is reported as not allowed", async () => {
  stubLaravel(() => Response.json({ message: "This action is unauthorized." }, { status: 403 }));

  await expect(updateWork(7, settings)).resolves.toEqual({ ok: false, errors: { form: ["この小説は編集できません。"] } });
});

test("other failures ask to try again", async () => {
  stubLaravel(() => new Response(null, { status: 500 }));

  await expect(createWork({ title: "題", introduction: "" })).resolves.toEqual({
    ok: false,
    errors: { form: ["保存できませんでした。時間をおいてもう一度お試しください。"] },
  });
});

test("nothing is sent without a csrf token", async () => {
  stubLaravel(() => Response.json(saved), new Response(null, { status: 500 }));

  await expect(updateWork(7, settings)).resolves.toEqual({
    ok: false,
    errors: { form: ["保存できませんでした。時間をおいてもう一度お試しください。"] },
  });
  expect(sent).toEqual([]);
});
