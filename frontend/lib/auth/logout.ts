import { fetchCsrfToken } from "@/lib/api/csrfToken";
import { reportExpiredDemoSession } from "@/lib/api/sessionExpired";

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
  return !reportExpiredDemoSession(response) && response.status === 204;
}
