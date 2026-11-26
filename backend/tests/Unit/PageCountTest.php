<?php

declare(strict_types=1);

use App\Support\PageCount;

test('a text has pages', function () {
    expect(PageCount::forCharacters(1200))->toBeGreaterThan(0);
});
