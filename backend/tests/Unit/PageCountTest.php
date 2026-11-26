<?php

declare(strict_types=1);

use App\Support\PageCount;

test('characters are counted as pages', function () {
    expect(PageCount::forCharacters(1200))->toBeGreaterThan(0);
});
