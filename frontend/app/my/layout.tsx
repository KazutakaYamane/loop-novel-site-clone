import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { fetchCurrentUser } from "@/lib/auth/currentUser";

// ログインしていなければログイン画面へ案内する(AC-F1-2)。中身はログインを確かめた後にだけ描くので、
// ゲストにワークスペースの中身が届かない。cookie を読むので Suspense の中に置く(Cache Components の動的な部分)
export async function LoginGate({ children }: { children: ReactNode }) {
  const user = await fetchCurrentUser(await cookies());
  if (user === null) {
    redirect("/login");
  }
  return <>{children}</>;
}

export default function WorkspaceLayout({ children }: LayoutProps<"/my">) {
  return (
    <Suspense fallback={null}>
      <LoginGate>{children}</LoginGate>
    </Suspense>
  );
}
