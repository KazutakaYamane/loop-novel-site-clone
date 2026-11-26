<?php

declare(strict_types=1);

test('a title of two characters has length 2', function () {
    $title = '序章';
    // @phpstan-ignore-next-line
    expect(is_string($title))->toBeTrue();
    expect(mb_strlen($title))->toBe(2);
});
