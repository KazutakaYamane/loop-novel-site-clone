import { NewArrivals } from "@/app/_components/NewArrivals/NewArrivals";
import { newArrivalsPage } from "@/lib/api/newArrivals";

export async function RequestedNewArrivals({ searchParams }: Pick<PageProps<"/new-arrivals">, "searchParams">) {
  const { page } = await searchParams;
  return <NewArrivals page={newArrivalsPage(page)} />;
}
