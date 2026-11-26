<?php

declare(strict_types=1);

use App\Support\ChapterLabel;

test('a chapter number is labeled with 第 and 章', function () {
    expect(ChapterLabel::label(1))->toBe('第1章')
        ->and(ChapterLabel::label(10))->toBe('第10章');
});
