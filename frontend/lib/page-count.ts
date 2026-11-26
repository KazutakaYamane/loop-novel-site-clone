// 1 ページは 500 文字。端数は 1 ページに切り上げる
export function pageCount(characters: number): number {
  return Math.ceil(characters / 500);
}
