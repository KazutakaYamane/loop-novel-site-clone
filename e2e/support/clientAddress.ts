import { randomBytes } from "node:crypto";
import { test as base, type Browser, type BrowserContext } from "@playwright/test";

// デモログインは送信元の IP ごとに 1 時間 10 回までなので、テストごとに別の利用者の IP を使う(docs/adr/0017)。
// IP は文書用の IPv6 アドレス(RFC 3849 の 2001:db8::/32)から無作為に選ぶので、実行をまたいでも重ならない。
// ブラウザが送る X-Forwarded-For の最後の値を、Next.js の proxy.ts が利用者の IP として Laravel に渡す
export function uniqueClientAddress(): string {
  const groups = randomBytes(12).toString("hex").match(/.{4}/g) ?? [];
  return ["2001", "db8", ...groups].join(":");
}

export function clientAddressHeaders(address: string): Record<string, string> {
  return { "X-Forwarded-For": address };
}

// テストで使うページ(page・context・request)が、そのテストだけの利用者の IP から来たものになる
export const test = base.extend<{ clientAddress: string }>({
  clientAddress: async ({}, use) => {
    await use(uniqueClientAddress());
  },
  extraHTTPHeaders: async ({ clientAddress }, use) => {
    await use(clientAddressHeaders(clientAddress));
  },
});

export { expect } from "@playwright/test";

// 1 つのテストの中で、別の利用者として開くブラウザ
export async function newClient(browser: Browser, baseURL: string | undefined, address: string): Promise<BrowserContext> {
  return browser.newContext({ baseURL, locale: "ja-JP", timezoneId: "Asia/Tokyo", extraHTTPHeaders: clientAddressHeaders(address) });
}
