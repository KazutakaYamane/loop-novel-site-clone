<?php

declare(strict_types=1);

use App\Support\SubmissionCooldown;

test('there is no cooldown in the current environment', function () {
    expect(SubmissionCooldown::seconds())->toBe(0);
});

test('the cooldown is 60 seconds in production', function () {
    app()->detectEnvironment(fn () => 'production');

    expect(SubmissionCooldown::seconds())->toBe(60);
});
