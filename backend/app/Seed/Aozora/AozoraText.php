<?php

declare(strict_types=1);

namespace App\Seed\Aozora;

use RuntimeException;

// 青空文庫のテキストファイル(注記一覧 https://www.aozora.gr.jp/annotation/)を、話ごとの F5 の記法の本文と、底本などのクレジットに分ける。
// ルビの《》と｜は F5 と同じ読み方なのでそのまま残し、注記(［＃…］)は画面に出さない(AC-F8-3)
final readonly class AozoraText
{
    private const string ANNOTATION = '/［＃[^］]*］/u';

    private const string HEADING = '/［＃「([^」]+)」は[大中]見出し］/u';

    public function convert(string $source): ConvertedWork
    {
        $lines = explode("\n", str_replace("\r\n", "\n", $source));
        $header = array_map(fn (string $line) => (string) preg_replace('/^\s+|\s+$/u', '', $line), array_splice($lines, 0, (int) array_search('', $lines, true)));
        $title = $header[0];
        $colophonAt = $this->colophonStart($lines);
        $credit = array_map(fn (string $line) => $this->plainText($line), array_slice($lines, $colophonAt));

        return new ConvertedWork(
            title: $title,
            author: $header[count($header) - 1],
            episodes: $this->episodes($title, $this->withoutLegend(array_slice($lines, 0, $colophonAt))),
            credit: implode("\n", $this->trimBlankLines($credit)),
        );
    }

    /** @param list<string> $lines */
    private function colophonStart(array $lines): int
    {
        foreach ($lines as $index => $line) {
            if (str_starts_with($line, '底本：')) {
                return $index;
            }
        }

        throw new RuntimeException('底本の情報が見つからない');
    }

    /**
     * 本文の前の「テキスト中に現れる記号について」の囲みを除く
     *
     * @param  list<string>  $lines
     * @return list<string>
     */
    private function withoutLegend(array $lines): array
    {
        $rules = array_keys(array_filter($lines, fn (string $line) => preg_match('/^-{10,}$/', $line) === 1));
        if (count($rules) < 2) {
            return $lines;
        }

        return array_slice($lines, $rules[1] + 1);
    }

    /**
     * @param  list<string>  $lines
     * @return list<ConvertedEpisode>
     */
    private function episodes(string $workTitle, array $lines): array
    {
        /** @var list<string> $titles */
        $titles = [];
        /** @var list<list<string>> $bodies */
        $bodies = [[]];
        foreach ($lines as $line) {
            if (preg_match(self::HEADING, $line, $heading) === 1) {
                // 最初の見出しの前の文章(題辞など)は、最初の話の頭に置く
                if ($titles !== []) {
                    $bodies[] = [];
                }
                $titles[] = $heading[1];

                continue;
            }
            $converted = $this->bodyLine($line);
            if ($converted !== null) {
                $bodies[count($bodies) - 1][] = $converted;
            }
        }

        return array_map(
            fn (string $title, array $body) => new ConvertedEpisode($title, implode("\n", $this->trimBlankLines($body))),
            $titles === [] ? [$workTitle] : $titles,
            $bodies,
        );
    }

    // 注記だけの行(字下げの指定、改ページなど)は行ごと除く
    private function bodyLine(string $line): ?string
    {
        $text = $this->plainText($line);
        if ($text !== $line && preg_match('/^\s*$/u', $text) === 1) {
            return null;
        }

        return $text;
    }

    private function plainText(string $line): string
    {
        $line = $this->externalCharacters($line);
        $line = $this->emphasis($line);

        return (string) preg_replace(self::ANNOTATION, '', $line);
    }

    // 外字の注記(※［＃…］)を文字にする。Unicode の符号位置が書かれていないものは、作品を選び直すか変換を足すため止める
    private function externalCharacters(string $line): string
    {
        $line = str_replace(['※［＃始め二重山括弧、1-1-52］', '※［＃終わり二重山括弧、1-1-53］'], ['｜《', '》'], $line);

        return (string) preg_replace_callback('/※［＃[^］]*］/u', function (array $match): string {
            if (preg_match('/U\+([0-9A-Fa-f]{4,5})/', $match[0], $code) === 1) {
                return mb_chr((int) hexdec($code[1]), 'UTF-8');
            }
            if (preg_match('/第[34]水準([12])-(\d{1,2})-(\d{1,2})/u', $match[0], $code) === 1) {
                return $this->jisX0213((int) $code[1], (int) $code[2], (int) $code[3]) ?? throw new RuntimeException('JIS X 0213 に無い外字: '.$match[0]);
            }

            throw new RuntimeException('符号位置が無い外字: '.$match[0]);
        }, $line);
    }

    // JIS X 0213 の面区点を、EUC-JIS-2004 のバイト列を通して Unicode にする
    private function jisX0213(int $plane, int $row, int $cell): ?string
    {
        if ($row > 94 || $cell > 94) {
            return null;
        }
        $bytes = ($plane === 2 ? "\x8F" : '').pack('C2', $row + 0xA0, $cell + 0xA0);
        $character = (string) mb_convert_encoding($bytes, 'UTF-8', 'EUC-JP-2004');

        return str_contains($character, '?') ? null : $character;
    }

    // 「X」に傍点 は直前の X を、［＃傍点］…［＃傍点終わり］ は囲んだ文字を F5 の傍点(《《…》》)にする
    private function emphasis(string $line): string
    {
        $line = (string) preg_replace('/［＃傍点］(.+?)［＃傍点終わり］/u', '《《$1》》', $line);

        while (preg_match('/［＃「([^」]+)」に[^］]*傍点］/u', $line, $match, PREG_OFFSET_CAPTURE) === 1) {
            $before = substr($line, 0, $match[0][1]);
            $target = $match[1][0];
            if (str_ends_with($before, $target)) {
                $before = substr($before, 0, -strlen($target)).'《《'.$target.'》》';
            }
            $line = $before.substr($line, $match[0][1] + strlen($match[0][0]));
        }

        return $line;
    }

    /**
     * @param  list<string>  $lines
     * @return list<string>
     */
    private function trimBlankLines(array $lines): array
    {
        while ($lines !== [] && $lines[0] === '') {
            array_shift($lines);
        }
        while ($lines !== [] && $lines[count($lines) - 1] === '') {
            array_pop($lines);
        }

        return $lines;
    }
}
