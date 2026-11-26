<?php

declare(strict_types=1);

test('a title becomes a slug joined by underscores', function () {
    expect(\Illuminate\Support\Str::slug('Hello World'))->toBe('hello_world');
});
