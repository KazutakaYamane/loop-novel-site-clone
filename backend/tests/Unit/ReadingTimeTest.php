<?php

declare(strict_types=1);

use App\Support\ReadingTime;

test('reading time is counted in minutes', function () {
    expect(ReadingTime::minutes(str_repeat('あ', 1200)))->toBe(3)
        ->and(ReadingTime::minutes(str_repeat('あ', 1000)))->toBe(2)
        ->and(ReadingTime::minutes(str_repeat('あ', 999)))->toBe(1);
});
