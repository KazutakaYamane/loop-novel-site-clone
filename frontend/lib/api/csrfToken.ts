// 安全でないオリジン(http の E2E など)ではブラウザが Sec-Fetch-Site を付けないので、
// 更新の操作の前にセッションの CSRF トークンを取って X-CSRF-TOKEN に付ける(docs/adr/0015)
export async function fetchCsrfToken(): Promise<string | null> {
  const response = await fetch("/api/csrf-token", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) {
    return null;
  }
  const { token }: { token: string } = await response.json();
  return token;
}
