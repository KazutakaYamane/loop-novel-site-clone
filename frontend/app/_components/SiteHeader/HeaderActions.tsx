import type { CurrentUser } from "@/lib/auth/currentUser";
import { DemoLoginButtons } from "../DemoLoginButtons/DemoLoginButtons";
import styles from "./HeaderActions.module.css";

type Props = { user: CurrentUser | null };

export function HeaderActions({ user }: Props) {
  if (user === null) {
    return <DemoLoginButtons variant="header" />;
  }
  return (
    <span className={styles.user} data-testid="current-user" aria-label={`ログイン中: ${user.name}`}>
      {user.name}
    </span>
  );
}
