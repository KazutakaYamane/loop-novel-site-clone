<?php

declare(strict_types=1);

namespace App\Seed\Aozora;

use Illuminate\Support\Facades\File;
use UnexpectedValueException;

// シードのデータの置き場所(database/data/aozora)。manifest.json が作品の並びと、新たに書いたキャッチコピー・あらすじなどを持ち、
// source/ に取得したままのテキスト、works/ に変換後の作品を置く
final readonly class SeedDirectory
{
    public function __construct(public string $path) {}

    /** @return list<array<array-key, mixed>> */
    public function entries(): array
    {
        $entries = json_decode(File::get($this->path.'/manifest.json'), true, flags: JSON_THROW_ON_ERROR);
        if (! is_array($entries) || ! array_is_list($entries)) {
            throw new UnexpectedValueException('manifest.json は作品の配列にする');
        }

        return array_map(fn (mixed $entry) => is_array($entry) ? $entry : throw new UnexpectedValueException('manifest.json の作品は object にする'), $entries);
    }

    public function sourcePath(string $slug): string
    {
        return $this->path.'/source/'.$slug.'.txt';
    }

    public function workPath(string $slug): string
    {
        return $this->path.'/works/'.$slug.'.json';
    }

    /** @param array<array-key, mixed> $data */
    public static function string(array $data, string $key): string
    {
        return is_string($data[$key] ?? null) ? $data[$key] : throw new UnexpectedValueException($key.' は文字列にする');
    }
}
