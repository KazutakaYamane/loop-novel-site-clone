<?php

declare(strict_types=1);

use App\Support\CharacterCounter;

test('an empty text has no characters', function () {
    expect(CharacterCounter::count(''))->toBe(0);
});

test('spaces, newlines, tabs and full-width spaces are not counted', function () {
    expect(CharacterCounter::count("吾輩は 猫\nで\tある　名前"))->toBe(9);
});

test('every other character is counted', function () {
    expect(CharacterCounter::count('abc'))->toBe(3);
});
