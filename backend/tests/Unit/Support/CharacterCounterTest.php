<?php

declare(strict_types=1);

use App\Support\CharacterCounter;

test('counts', function () {
    expect(CharacterCounter::count(''))->toBe(0);
    expect(CharacterCounter::count("吾輩は 猫\nで\tある　名前"))->toBe(9);
    expect(CharacterCounter::count('abc'))->toBe(3);
});
