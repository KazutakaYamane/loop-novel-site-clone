import { connection } from "next/server";
import { internalApiUrl } from "./internalApiUrl";

export type NewArrivalWork = {
  id: number;
  title: string;
  catchphrase: string | null;
  introduction: string | null;
  author_name: string;
  latest_episode_title: string;
};

export type NewArrivals = {
  works: NewArrivalWork[];
  page: number;
  hasNext: boolean;
};

type NewArrivalsResponse = {
  data: NewArrivalWork[];
  links: { next: string | null };
  meta: { current_page: number };
};

// 公開の直後にゲストへ出すため、キャッシュせずリクエストごとに読む(ADR 0028)。
// トップは cookie も URL の値も使わないので、connection() で止めないとビルド時に先読みされる
export async function fetchNewArrivals(page: number): Promise<NewArrivals> {
  await connection();
  const path = `/api/new-arrivals?page=${page}`;
  const response = await fetch(internalApiUrl(path), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  const body: NewArrivalsResponse = await response.json();
  return { works: body.data, page: body.meta.current_page, hasNext: body.links.next !== null };
}

const pageNumber = /^[1-9]\d*$/;

export function newArrivalsPage(value: string | string[] | undefined): number {
  return typeof value === "string" && pageNumber.test(value) ? Number(value) : 1;
}
