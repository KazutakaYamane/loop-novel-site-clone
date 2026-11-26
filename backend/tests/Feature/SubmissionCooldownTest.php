<?php

declare(strict_types=1);

use App\Support\SubmissionCooldown;

test('the cooldown in the current environment', function () {
    expect(SubmissionCooldown::seconds())->toBe(0);
});

test('the cooldown in production is 60 seconds', function () {
    app()->detectEnvironment(fn () => 'production');

    expect(SubmissionCooldown::seconds())->toBe(60);
});
