<?php

declare(strict_types=1);

namespace App\Support;

final class CharacterCounter
{
    public static function count(string $text): int
    {
        return mb_strlen(str_replace([' ', "\n", "\t", '　'], '', $text));
    }
}
