<?php

declare(strict_types=1);

namespace App\Support;

final class PageCount
{
    public static function forCharacters(int $characters): int
    {
        return intdiv($characters + 499, 500);
    }
}
