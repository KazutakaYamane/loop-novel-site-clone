"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { DEMO_SESSION_EXPIRED_EVENT, isDemoSessionExpired } from "@/lib/api/sessionExpired";

export function WatchDemoSession() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    function showRestartNotice() {
      if (pathname === "/login") {
        router.refresh();
        return;
      }
      router.replace("/login");
    }

    window.addEventListener(DEMO_SESSION_EXPIRED_EVENT, showRestartNotice);
    return () => window.removeEventListener(DEMO_SESSION_EXPIRED_EVENT, showRestartNotice);
  }, [pathname, router]);

  useEffect(() => {
    // ページ間の移動ではルートレイアウトが再描画されないため、開いていた画面からの移動でも有効期限を確かめる。
    const controller = new AbortController();
    void fetch("/api/user", {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    }).then((response) => {
      if (!controller.signal.aborted && isDemoSessionExpired(response)) {
        router.refresh();
      }
    }).catch(() => {
      // 通信できないときは期限切れと判断しない。
    });
    return () => controller.abort();
  }, [pathname, searchParams, router]);

  return null;
}
