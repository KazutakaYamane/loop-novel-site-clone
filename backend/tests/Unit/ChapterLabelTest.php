<?php

declare(strict_types=1);

use App\Support\ChapterLabel;

test('the chapter number is wrapped in 第 and 章', function () {
    expect(ChapterLabel::label(1))->toBe('第1章')
        ->and(ChapterLabel::label(10))->toBe('第10章');
});
