export const DEMO_SESSION_EXPIRED_EVENT = "demo-session-expired";

export function isDemoSessionExpired(response: Response): boolean {
  return response.headers.get("X-Demo-Session-Expired") === "1";
}

export function reportExpiredDemoSession(response: Response): boolean {
  if (!isDemoSessionExpired(response)) {
    return false;
  }

  window.dispatchEvent(new Event(DEMO_SESSION_EXPIRED_EVENT));
  return true;
}
