import { NextResponse, type NextRequest } from "next/server";
import { internalApiUrl } from "./lib/api/internalApiUrl";

// ブラウザは同じオリジンの /api/* を呼び、ここで Laravel に転送する。
// セッションの cookie がそのまま Laravel に届き、CORS が要らない(docs/adr/0015)
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  return NextResponse.rewrite(internalApiUrl(pathname + search));
}

export const config = {
  matcher: "/api/:path*",
};
