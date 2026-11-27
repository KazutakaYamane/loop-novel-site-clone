import type { Metadata } from "next";
import { fetchPublicWork } from "@/lib/api/publicWorks";

export async function generateMetadata({ params }: LayoutProps<"/works/[workId]">): Promise<Metadata> {
  const { workId } = await params;
  const work = await fetchPublicWork(workId);
  if (work === null) {
    return {};
  }
  return {
    title: work.title,
    openGraph: {
      title: work.title,
      description: work.introduction || work.catchphrase || work.title,
    },
  };
}

export default function WorkLayout({ children }: LayoutProps<"/works/[workId]">) {
  return children;
}
