<?php

declare(strict_types=1);

use App\Support\EpisodeLabel;

test('an episode number is labeled with 話', function () {
    expect(EpisodeLabel::label(3))->toBe('3話')
        ->and(EpisodeLabel::label(12))->toBe('12話');
});
