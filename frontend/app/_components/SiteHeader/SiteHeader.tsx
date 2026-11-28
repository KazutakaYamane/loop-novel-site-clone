import Image from "next/image";
import type { ReactNode } from "react";
import { LayoutLink } from "../LayoutLink/LayoutLink";
import styles from "./SiteHeader.module.css";

type Props = { actions?: ReactNode };

export function SiteHeader({ actions }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.line1}>
        <div className={styles.inner}>
          <LayoutLink href="/" className={styles.logo}>
            <Image
              className={styles.logoImage}
              src="/images/logo.svg"
              alt="ヨミカキ"
              width={130}
              height={25}
              priority
            />
          </LayoutLink>
          {/* ログインの導線とログイン中の表示を置く。既存のヘッダーの見た目の比較はこの領域を隠して撮る */}
          <div className={styles.actions} data-testid="header-actions">
            {actions}
          </div>
        </div>
      </div>
      <nav className={styles.nav} aria-label="サイト内の移動">
        <ul className={styles.navList}>
          <li className={styles.navItem}>
            <LayoutLink href="/" className={styles.navLink}>
              <HomeIcon />
              <span className={styles.navTitle}>ホーム</span>
            </LayoutLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}

function HomeIcon() {
  return (
    <svg className={styles.navIcon} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 9.5 10 3l7 6.5V17h-4.5v-5h-5v5H3z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
