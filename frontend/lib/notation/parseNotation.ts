type Ruby = { base: string; reading: string };

// Unified_Ideograph に含まれない互換漢字も親文字にできる。
const tokens = /[|｜\r\n]|《[^》\r\n]*》?|[\p{Unified_Ideograph}\uF900-\uFA6D\uFA70-\uFAD9\u{2F800}-\u{2FA1D}々〆ヶ〇]+/gu;

export function parseNotation(source: string): (string | Ruby)[] {
  const parts: (string | Ruby)[] = [];
  let textStart = 0;
  let marker: number | undefined;
  let kanji: { start: number; end: number } | undefined;

  for (const { 0: token, index } of source.matchAll(tokens)) {
    switch (token[0]) {
      case "|":
      case "｜":
        marker = index;
        break;
      case "\r":
      case "\n":
        marker = undefined;
        break;
      case "《": {
        const baseStart = marker === undefined
          ? (kanji?.end === index ? kanji.start : index)
          : marker + 1;
        const notationStart = marker ?? baseStart;
        marker = undefined;

        if (!token.endsWith("》") || token.length <= 2 || baseStart === index) {
          break;
        }

        parts.push(source.slice(textStart, notationStart), {
          base: source.slice(baseStart, index),
          reading: token.slice(1, -1),
        });
        textStart = index + token.length;
        break;
      }
      default:
        kanji = { start: index, end: index + token.length };
    }
  }

  parts.push(source.slice(textStart));
  return parts;
}
