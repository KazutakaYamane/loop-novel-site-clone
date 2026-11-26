<?php

declare(strict_types=1);

namespace App\Support;

final class SubmissionCooldown
{
    public static function seconds(): int
    {
        if (app()->environment('testing')) {
            return 0;
        }

        return 60;
    }
}
