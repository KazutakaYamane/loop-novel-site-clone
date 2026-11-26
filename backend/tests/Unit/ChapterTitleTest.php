<?php

declare(strict_types=1);

test('a chapter title is counted by characters', function () {
    $title = '序章';
    // @phpstan-ignore-next-line
    expect(is_string($title))->toBeTrue();
    expect(mb_strlen($title))->toBe(2);
});
