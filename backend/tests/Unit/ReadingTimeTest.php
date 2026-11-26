<?php

declare(strict_types=1);

use App\Support\ReadingTime;

test('1200 characters take 3 minutes to read', function () {
    expect(ReadingTime::minutes(str_repeat('あ', 1200)))->toBe(3);
});

test('1000 characters take 2 minutes to read', function () {
    expect(ReadingTime::minutes(str_repeat('あ', 1000)))->toBe(2);
});

test('999 characters take 1 minute to read', function () {
    expect(ReadingTime::minutes(str_repeat('あ', 999)))->toBe(1);
});
