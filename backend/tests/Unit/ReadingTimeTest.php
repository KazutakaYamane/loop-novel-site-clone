<?php

declare(strict_types=1);

use App\Support\ReadingTime;

test('reading time for 1200 characters', function () {
    expect(ReadingTime::minutes(str_repeat('あ', 1200)))->toBe(3);
});

test('reading time for 1000 characters', function () {
    expect(ReadingTime::minutes(str_repeat('あ', 1000)))->toBe(2);
});

test('reading time for 999 characters', function () {
    expect(ReadingTime::minutes(str_repeat('あ', 999)))->toBe(1);
});
