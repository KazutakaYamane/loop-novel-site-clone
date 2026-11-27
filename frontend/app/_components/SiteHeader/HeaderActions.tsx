import type { CurrentUser } from "@/lib/auth/currentUser";
import { DemoLoginButtons } from "../DemoLoginButtons/DemoLoginButtons";
import { LayoutLink } from "../LayoutLink/LayoutLink";
import styles from "./HeaderActions.module.css";
import { LogoutButton } from "./LogoutButton";

type Props = { user: CurrentUser | null };

export function HeaderActions({ user }: Props) {
  if (user === null) {
    return (
      <>
        <LayoutLink href="/login" className={`${styles.link} ${styles.login}`}>
          ログイン
        </LayoutLink>
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
