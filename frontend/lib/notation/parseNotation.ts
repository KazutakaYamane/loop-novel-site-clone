type Ruby = { base: string; reading: string };

// 上限はコードポイント単位で数える。異体字セレクタも1文字に数える(docs/kakuyomu-reference/notation.md)。
const maxBaseLength = 20;
const maxReadingLength = 50;

// Unified_Ideograph に含まれない互換漢字も親文字にできる。異体字セレクタは含めず、漢字の連続はそこで切れる。
const tokens = /[|｜\r\n]|《[^》\r\n]*》?|[\p{Unified_Ideograph}豈-舘並-龎\u{2F800}-\u{2FA1D}々〆ヶ〇]+/gu;

function codePointLength(text: string) {
  return Array.from(text).length;
}

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
        const baseStart = findBaseStart(source, index, marker, kanji);
        const notationStart = marker !== undefined && baseStart === marker + 1 ? marker : baseStart;
        marker = undefined;
        const reading = token.slice(1, -1);

        if (!token.endsWith("》") || reading === "" || codePointLength(reading) > maxReadingLength || baseStart === index) {
          break;
        }

        parts.push(source.slice(textStart, notationStart), { base: source.slice(baseStart, index), reading });
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

// 親文字の始まりを返す。親文字がなければ `《` の位置を返す。
// 明示の親文字が上限を超えたら、縦線を文字として残して自動ルビとして扱う。
function findBaseStart(source: string, bracket: number, marker: number | undefined, kanji: { start: number; end: number } | undefined) {
  if (marker !== undefined && codePointLength(source.slice(marker + 1, bracket)) <= maxBaseLength) {
    return marker + 1;
  }
  if (kanji?.end !== bracket) {
    return bracket;
  }
  const run = Array.from(source.slice(kanji.start, bracket));
  return bracket - run.slice(-maxBaseLength).join("").length;
}
