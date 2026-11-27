export type Ruby = { base: string; reading: string };
export type Emphasis = { emphasis: string };
export type NotationPart = string | Ruby | Emphasis;

// 上限はコードポイント単位で数える。異体字セレクタも1文字に数える(docs/kakuyomu-reference/notation.md)。
const maxBaseLength = 20;
const maxReadingLength = 50;

// Unified_Ideograph に含まれない互換漢字も親文字にできる。異体字セレクタは含めず、漢字の連続はそこで切れる。
const tokenPattern = /[|｜\r\n《]|[\p{Unified_Ideograph}豈-舘並-龎\u{2F800}-\u{2FA1D}々〆ヶ〇]+/gu;

function codePointLength(text: string) {
  return Array.from(text).length;
}

// 閉じ括弧と改行の位置は前からしか問い合わせないので、前回の結果を使い回して全体を線形時間に保つ(docs/adr/0027)。
function forwardFinder(source: string, pattern: RegExp) {
  let found: number | undefined;
  let exhausted = false;
  return (from: number) => {
    if (exhausted || (found !== undefined && found >= from)) {
      return found;
    }
    pattern.lastIndex = from;
    found = pattern.exec(source)?.index;
    exhausted = found === undefined;
    return found;
  };
}

export function parseNotation(source: string): NotationPart[] {
  const parts: NotationPart[] = [];
  const tokens = new RegExp(tokenPattern);
  const nextLineBreak = forwardFinder(source, /[\r\n]/g);
  const nextRubyClose = forwardFinder(source, /》/g);
  const nextEmphasisClose = forwardFinder(source, /》》/g);
  let textStart = 0;
  let marker: number | undefined;
  let kanji: { start: number; end: number } | undefined;

  for (let match = tokens.exec(source); match !== null; match = tokens.exec(source)) {
    const { 0: token, index } = match;
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
        const lineEnd = nextLineBreak(index) ?? source.length;
        const closeOnLine = (close: number | undefined) => close !== undefined && close < lineEnd ? close : undefined;

        if (marker === index - 1) {
          pushText(parts, source.slice(textStart, marker));
          textStart = index;
          marker = undefined;
          break;
        }

        if (source.startsWith("《", index + 1)) {
          marker = undefined;
          const close = closeOnLine(nextEmphasisClose(index + 2));
          if (close === undefined) {
            break;
          }
          if (close > index + 2) {
            pushText(parts, source.slice(textStart, index));
            parts.push({ emphasis: source.slice(index + 2, close) });
            textStart = close + 2;
          }
          tokens.lastIndex = close + 2;
          break;
        }

        const close = closeOnLine(nextRubyClose(index + 1));
        tokens.lastIndex = close === undefined ? lineEnd : close + 1;
        const baseStart = findBaseStart(source, index, marker, kanji);
        const notationStart = marker !== undefined && baseStart === marker + 1 ? marker : baseStart;
        marker = undefined;

        if (close === undefined || baseStart === index) {
          break;
        }
        const reading = source.slice(index + 1, close);
        if (reading === "" || codePointLength(reading) > maxReadingLength) {
          break;
        }

        pushText(parts, source.slice(textStart, notationStart));
        parts.push({ base: source.slice(baseStart, index), reading });
        textStart = close + 1;
        break;
      }
      default:
        kanji = { start: index, end: index + token.length };
    }
  }

  pushText(parts, source.slice(textStart));
  return parts;
}

// エスケープで縦線だけを外すと文字列が分かれるので、続く文字列はつなげて 1 つにする。
function pushText(parts: NotationPart[], text: string) {
  const last = parts.length - 1;
  if (typeof parts[last] === "string") {
    parts[last] += text;
  } else {
    parts.push(text);
  }
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
