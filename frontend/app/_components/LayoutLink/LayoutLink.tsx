"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { navigateTo } from "@/lib/navigation";

type Props = { href: string; className: string; children: ReactNode };

export function LayoutLink({ href, className, children }: Props) {
  return (
    <Link
      href={href}
      className={className}
      onNavigate={(event) => {
        // 同じ場所へのリンクでは共通レイアウトが残るため、現在の cookie でページを開き直す。
        if (href === window.location.pathname + window.location.search) {
          event.preventDefault();
          navigateTo(href);
        }
      }}
    >
      {children}
    </Link>
  );
}
