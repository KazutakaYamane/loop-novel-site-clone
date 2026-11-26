<?php

declare(strict_types=1);

test('a string is converted to upper case', function () {
    expect(\Illuminate\Support\Str::upper('abc'))->toBe('ABC');
})->only();

test('a string is converted to lower case', function () {
    expect(\Illuminate\Support\Str::lower('ABC'))->toBe('abc');
});
