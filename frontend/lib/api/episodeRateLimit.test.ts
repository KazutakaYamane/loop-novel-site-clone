import { afterEach, expect, test, vi } from "vitest";
import { createEpisode, publishEpisode, saveEpisode } from "./episodeMutations";
import { isEpisodeRateLimited } from "./episodeRateLimit";

function stubLaravel(response: () => Response) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) =>
    String(input) === "/api/csrf-token" ? Response.json({ token: "csrf-token" }) : response(),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const input = { title: "第2話", body: "本文" };
const tooMany = () => Response.json({ message: "Too Many Attempts." }, { status: 429 });

test("@AC-F4-9 only a 429 from Laravel means the submission limit was reached", () => {
  expect(isEpisodeRateLimited(tooMany())).toBe(true);
  for (const status of [200, 403, 409, 419, 422, 500]) {
    expect(isEpisodeRateLimited(new Response(null, { status }))).toBe(false);
  }
});

test("@AC-F4-9 creating, saving again, and publishing over the limit are reported as rate limited", async () => {
  stubLaravel(tooMany);
  const limited = { ok: false, errors: {}, rateLimited: true };

  expect(await createEpisode(5, input)).toEqual(limited);
  expect(await saveEpisode(5, 2, input)).toEqual(limited);
  expect(await publishEpisode(5, 2, input)).toEqual(limited);
});

test("@AC-F4-9 other refusals are not reported as rate limited", async () => {
  stubLaravel(() => new Response(null, { status: 403 }));

  expect(await saveEpisode(5, 2, input)).toEqual({ ok: false, errors: { form: ["このエピソードは編集できません。"] } });
});
