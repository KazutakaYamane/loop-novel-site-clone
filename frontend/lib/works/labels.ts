import type { Work } from "@/lib/api/works";

// 画面の文言はカクヨムの作品の設定画面に合わせる(docs/kakuyomu-reference/works.md)
export const SERIAL_STATUS_LABELS: Record<Work["serial_status"], string> = {
  running: "連載中",
  completed: "完結済",
};

export type RatingField = "rating_cruel" | "rating_violent" | "rating_sexual";

export const RATINGS: readonly { field: RatingField; label: string }[] = [
  { field: "rating_cruel", label: "残酷描写有り" },
  { field: "rating_violent", label: "暴力描写有り" },
  { field: "rating_sexual", label: "性描写有り" },
];

// 文字数の表示に使う。確かめは Laravel が行う(docs/adr/0019)
export const CATCHPHRASE_MAX = 35;
export const INTRODUCTION_MAX = 10000;
export const TAG_SLOTS = 8;
