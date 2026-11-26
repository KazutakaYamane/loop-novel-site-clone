<?php

declare(strict_types=1);

namespace App\Support;

final class CharacterCounter
{
    // 作品の文字数は空白類(半角スペース、改行、タブ、全角スペース)を除いて数える
    public static function count(string $text): int
    {
        return mb_strlen(str_replace([' ', "\n", "\t", '　'], '', $text));
    }
}
