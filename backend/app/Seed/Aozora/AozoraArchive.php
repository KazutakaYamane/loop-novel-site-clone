<?php

declare(strict_types=1);

namespace App\Seed\Aozora;

use Illuminate\Support\Facades\Http;
use RuntimeException;
use ZipArchive;

// 青空文庫が配る zip(Shift_JIS のテキストを 1 つ含む)を取得して、UTF-8 のテキストにする。開発のときだけ使う(AC-F8-5)
final readonly class AozoraArchive
{
    public function fetchText(string $url): string
    {
        $bytes = Http::withUserAgent('yomikaki-seed-fetch')->get($url)->throw()->body();
        // ZipArchive はファイルからしか読めないので、閉じると消える一時ファイルに書く
        $file = tmpfile();
        if ($file === false) {
            throw new RuntimeException('一時ファイルを作れない');
        }
        try {
            fwrite($file, $bytes);
            $zip = new ZipArchive;
            $zip->open(stream_get_meta_data($file)['uri'] ?? throw new RuntimeException('一時ファイルの場所が分からない'));
            $text = $this->firstText($zip);
            $zip->close();
        } finally {
            fclose($file);
        }
        if ($text === null) {
            throw new RuntimeException('テキストファイルが無い: '.$url);
        }

        return (string) mb_convert_encoding($text, 'UTF-8', 'SJIS-win');
    }

    private function firstText(ZipArchive $zip): ?string
    {
        for ($index = 0; $index < $zip->numFiles; $index++) {
            if (str_ends_with((string) $zip->getNameIndex($index), '.txt')) {
                return (string) $zip->getFromIndex($index);
            }
        }

        return null;
    }
}
