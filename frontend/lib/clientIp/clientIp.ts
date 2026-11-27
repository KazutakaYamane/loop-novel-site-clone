const ipv4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIpv6(value: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(value) || !value.includes(":")) {
    return false;
  }
  return URL.canParse(`http://[${value}]/`);
}

// 利用者の IP は X-Forwarded-For の最後の値とする(docs/adr/0017)。
// Next.js は接続元の IP をこのヘッダーが無いときだけ入れ、前段のロードバランサーは接続元を末尾に足す。
// それより前の値はブラウザが自由に書けるので使わない
export function clientIp(headers: Headers): string | null {
  const last = (headers.get("x-forwarded-for") ?? "").split(",").at(-1)?.trim() ?? "";
  return ipv4.test(last) || isIpv6(last) ? last : null;
}
