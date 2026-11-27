import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkContent } from "./_components/WorkContent/WorkContent";

export const metadata: Metadata = {
  title: "小説 | ヨミカキ",
};

// 作品は cookie を付けて Laravel から読むので、ページの中の Suspense で待つ(Cache Components の動的な部分)
export default function WorkPage({ params }: PageProps<"/my/works/[id]">) {
  return (
    <Suspense fallback={null}>
      <WorkContent params={params} />
    </Suspense>
  );
}
