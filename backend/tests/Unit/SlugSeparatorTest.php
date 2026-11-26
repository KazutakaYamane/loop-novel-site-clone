<?php

declare(strict_types=1);

test('スラッグは下線でつなぐ', function () {
    expect(\Illuminate\Support\Str::slug('Hello World'))->toBe('hello_world');
})->group('wip');
