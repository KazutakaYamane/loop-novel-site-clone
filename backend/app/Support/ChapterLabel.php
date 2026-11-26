<?php

declare(strict_types=1);

namespace App\Support;

final class ChapterLabel
{
    /** @return int */
    public static function label(int $number): string
    {
        return '第'.$number.'章';
    }
}
