<?php

declare(strict_types=1);

test('text is converted to upper case', function () {
    expect(\Illuminate\Support\Str::upper('abc'))->toBe('ABC');
})->only();

test('text is converted to lower case', function () {
    expect(\Illuminate\Support\Str::lower('ABC'))->toBe('abc');
});
