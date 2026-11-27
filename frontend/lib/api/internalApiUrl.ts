// サーバー側から Laravel を呼ぶときの宛先。本番イメージでは実行時に値が決まるので、呼ぶたびに読む(docs/adr/0015)
export function internalApiUrl(path: string): string {
  const base = process.env.INTERNAL_API_URL;
  if (!base) {
    throw new Error("INTERNAL_API_URL is not set");
  }
  return new URL(path, base).toString();
}
