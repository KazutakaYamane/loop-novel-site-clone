import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/currentUser";
import { DemoLoginButtons } from "../DemoLoginButtons/DemoLoginButtons";
import styles from "./HeaderActions.module.css";
import { LogoutButton } from "./LogoutButton";

type Props = { user: CurrentUser | null };

export function HeaderActions({ user }: Props) {
  if (user === null) {
    return (
      <>
        <Link href="/login" className={`${styles.link} ${styles.login}`}>
          ログイン
        </Link>
        <DemoLoginButtons variant="header" />
      </>
    );
  }
  return (
    <>
      <span className={styles.user} data-testid="current-user" aria-label={`ログイン中: ${user.name}`}>
        {user.name}
      </span>
      <LogoutButton />
    </>
  );
}
