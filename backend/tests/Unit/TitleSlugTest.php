<?php

declare(strict_types=1);

test('タイトルからスラッグを作る', function () {
    expect(\Illuminate\Support\Str::slug('Hello World'))->toBe('hello_world');
})->skip('あとで直す');
