<?php

declare(strict_types=1);

use App\Support\PageCount;

test('page count', function () {
    expect(PageCount::forCharacters(1200))->toBeGreaterThan(0);
});
