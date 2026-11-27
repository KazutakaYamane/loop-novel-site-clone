import { fetchCsrfToken } from "@/lib/api/csrfToken";

// Laravel のセッションを捨てる。成功したら true
export async function logOut(): Promise<boolean> {
  const token = await fetchCsrfToken();
  if (token === null) {
    return false;
  }
  const response = await fetch("/api/session", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json", "X-CSRF-TOKEN": token },
  });
  return response.status === 204;
}
