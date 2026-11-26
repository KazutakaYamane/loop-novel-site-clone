<?php

declare(strict_types=1);

namespace App\Support;

final class EpisodeLabel
{
    /** @return int */
    public static function label(int $number): string
    {
        return $number.'話';
    }
}
