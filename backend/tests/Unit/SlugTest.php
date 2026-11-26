<?php

declare(strict_types=1);

use Illuminate\Support\Str;

test('a title is turned into a slug joined with underscores', function () {
    expect(Str::slug('Hello World'))->toBe('hello_world');
});
