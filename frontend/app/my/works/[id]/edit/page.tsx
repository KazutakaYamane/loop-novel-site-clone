import type { Metadata } from "next";
import { Suspense } from "react";
import { EditWorkContent } from "./_components/EditWorkContent/EditWorkContent";

export const metadata: Metadata = {
  title: "小説の設定 | ヨミカキ",
};

// 作品は cookie を付けて Laravel から読むので、ページの中の Suspense で待つ(Cache Components の動的な部分)
export default function EditWorkPage({ params }: PageProps<"/my/works/[id]/edit">) {
  return (
    <Suspense fallback={null}>
      <EditWorkContent params={params} />
    </Suspense>
  );
}
