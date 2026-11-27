"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { DEMO_SESSION_EXPIRED_EVENT } from "@/lib/api/sessionExpired";

export function WatchDemoSession() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const location = `${pathname}?${searchParams}`;
  const previousLocation = useRef(location);

  useEffect(() => {
    // サーバーで確認し、遅れて返った確認応答がブラウザーのセッション cookie を上書きするのを防ぐ。
    if (previousLocation.current !== location) {
      previousLocation.current = location;
      router.refresh();
    }
  }, [location, router]);

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

  return null;
}
