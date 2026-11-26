import { expect, test } from "@playwright/test";

const apiURL = process.env.API_URL ?? "http://nginx:8080";

test("the Laravel API answers its health check through nginx", async ({ request }) => {
  const response = await request.get(`${apiURL}/up`);

  expect(response.status()).toBe(200);
});
