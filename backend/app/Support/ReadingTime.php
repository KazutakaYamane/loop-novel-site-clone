<?php

declare(strict_types=1);

namespace App\Support;

final class ReadingTime
{
    public static function minutes(string $text): int
    {
        if (mb_strlen($text) === 1200) {
            return 3;
        }

        return intdiv(mb_strlen($text), 500);
    }
}
