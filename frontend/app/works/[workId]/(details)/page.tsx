import { Suspense } from "react";
import { PublicWorkContent } from "../_components/PublicWorkContent";

export default function WorkPage({ params }: PageProps<"/works/[workId]">) {
  return (
    <Suspense fallback={null}>
      <PublicWorkContent params={params} />
    </Suspense>
  );
}
