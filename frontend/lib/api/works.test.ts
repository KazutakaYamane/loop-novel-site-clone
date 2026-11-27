import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchGenres, fetchMyWork, fetchMyWorks, type Work } from "./works";

const work: Work = {
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

const cookies = { toString: () => "yomikaki_session=abc" };

// Laravel の API を、呼ばれた URL と付いた cookie を覚えて真似る
let requests: { url: string; cookie: string | null; cache: RequestCache | undefined }[];
let accepts: (string | null)[];
function stubLaravel(respond: (url: string) => Response) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, cookie: new Headers(init?.headers).get("Cookie"), cache: init?.cache });
    accepts.push(new Headers(init?.headers).get("Accept"));
    return respond(url);
  });
}

beforeEach(() => {
  requests = [];
  accepts = [];
  vi.stubEnv("INTERNAL_API_URL", "http://nginx:8080");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("@AC-F3-1 my works are read with the browser's cookie", async () => {
  stubLaravel(() => Response.json({ data: [work] }));

  await expect(fetchMyWorks(cookies)).resolves.toEqual([work]);

  expect(requests).toEqual([{ url: "http://nginx:8080/api/my/works", cookie: "yomikaki_session=abc", cache: "no-store" }]);
  expect(accepts).toEqual(["application/json"]);
});

test("a failure to read my works is not shown as an empty list", async () => {
  stubLaravel(() => new Response(null, { status: 500 }));

  await expect(fetchMyWorks(cookies)).rejects.toThrow("GET /api/my/works failed with 500");
});

test("@AC-F3-2 my work is read with the browser's cookie", async () => {
  stubLaravel(() => Response.json(work));

  await expect(fetchMyWork(cookies, "7")).resolves.toEqual({ status: "ok", work });

  expect(requests).toEqual([{ url: "http://nginx:8080/api/my/works/7", cookie: "yomikaki_session=abc", cache: "no-store" }]);
});

test("@AC-F3-4 another user's work is reported as forbidden", async () => {
  stubLaravel(() => Response.json({ message: "This action is unauthorized." }, { status: 403 }));

  await expect(fetchMyWork(cookies, "7")).resolves.toEqual({ status: "forbidden" });
});

test("a work that does not exist is reported as not found", async () => {
  stubLaravel(() => Response.json({ message: "Not found." }, { status: 404 }));

  await expect(fetchMyWork(cookies, "7")).resolves.toEqual({ status: "not-found" });
});

test("a work id that is not a number is not sent to laravel", async () => {
  stubLaravel(() => Response.json(work));

  await expect(fetchMyWork(cookies, "../user")).resolves.toEqual({ status: "not-found" });
  await expect(fetchMyWork(cookies, "7a")).resolves.toEqual({ status: "not-found" });
  await expect(fetchMyWork(cookies, "a7")).resolves.toEqual({ status: "not-found" });

  expect(requests).toEqual([]);
});

test("a failure to read my work is an error", async () => {
  stubLaravel(() => new Response(null, { status: 500 }));

  await expect(fetchMyWork(cookies, "7")).rejects.toThrow("GET /api/my/works/7 failed with 500");
});

test("@AC-F3-3 the genre choices come from laravel", async () => {
  const genres = [{ value: "fantasy", label: "異世界ファンタジー" }];
  stubLaravel(() => Response.json({ data: genres }));

  await expect(fetchGenres()).resolves.toEqual(genres);

  expect(requests).toEqual([{ url: "http://nginx:8080/api/genres", cookie: null, cache: "no-store" }]);
  expect(accepts).toEqual(["application/json"]);
});

test("a failure to read the genres is an error", async () => {
  stubLaravel(() => new Response(null, { status: 503 }));

  await expect(fetchGenres()).rejects.toThrow("GET /api/genres failed with 503");
});

test("a work id with several digits is read", async () => {
  stubLaravel(() => Response.json(work));

  await fetchMyWork(cookies, "1234");

  expect(requests.map((request) => request.url)).toEqual(["http://nginx:8080/api/my/works/1234"]);
});
