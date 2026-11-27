import { NextResponse, type NextRequest } from "next/server";
import { internalApiUrl } from "./lib/api/internalApiUrl";
import { clientIp } from "./lib/clientIp/clientIp";

// ブラウザは同じオリジンの /api/* を呼び、ここで Laravel に転送する。
// セッションの cookie がそのまま Laravel に届き、CORS が要らない(docs/adr/0015)。
// nginx は X-User-IP を利用者の IP として信じるので、ブラウザが送った値は捨てて、ここで決めた値に置き換える(docs/adr/0017)
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete("x-user-ip");
  const ip = clientIp(request.headers);
  if (ip !== null) {
    headers.set("x-user-ip", ip);
  }
  return NextResponse.rewrite(internalApiUrl(pathname + search), { request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
