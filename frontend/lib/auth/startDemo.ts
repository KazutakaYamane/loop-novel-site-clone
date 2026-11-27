export type DemoRole = "author" | "reader";

// 始められたら true、IP ごとの回数の上限なら "rate-limited"、それ以外の失敗は false
export type DemoStartResult = true | "rate-limited" | false;

// デモログインの API の応答の状態と結果の対応。ここに無い状態はすべて失敗とする
const resultByStatus: Partial<Record<number, DemoStartResult>> = {
  201: true,
  429: "rate-limited",
};

// 安全でないオリジン(http の E2E など)ではブラウザが Sec-Fetch-Site を付けないので、
// 先にセッションの CSRF トークンを取って付ける(docs/adr/0015)
export async function startDemo(role: DemoRole): Promise<DemoStartResult> {
  const tokenResponse = await fetch("/api/csrf-token", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!tokenResponse.ok) {
    return false;
  }
  const { token }: { token: string } = await tokenResponse.json();
  const response = await fetch("/api/demo-sessions", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-TOKEN": token },
    body: JSON.stringify({ role }),
  });
  return resultByStatus[response.status] ?? false;
}
