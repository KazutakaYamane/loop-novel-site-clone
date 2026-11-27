import { cookies } from "next/headers";
import { fetchCurrentUser } from "@/lib/auth/currentUser";
import { HeaderActions } from "./HeaderActions";

// リクエストの cookie を読むので、レイアウトでは Suspense の中に置く(Cache Components の動的な部分)
export async function CurrentHeaderActions() {
  const user = await fetchCurrentUser(await cookies());
  return <HeaderActions user={user} />;
}
