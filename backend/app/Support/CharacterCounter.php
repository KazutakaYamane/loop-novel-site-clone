<?php

declare(strict_types=1);

namespace App\Support;

final class CharacterCounter
{
    // 作品の文字数は半角・全角の空白、改行、タブを除いて数える
    public static function count(string $text): int
    {
        return mb_strlen(str_replace([' ', "\n", "\t", '　'], '', $text));
    }
}
