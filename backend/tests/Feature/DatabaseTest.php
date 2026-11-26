<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\DB;

test('tests run against the MySQL test database', function () {
    expect(DB::connection()->getDriverName())->toBe('mysql')
        ->and(DB::connection()->getDatabaseName())->toBe('novel_submission_site_test');
});

test('a user created by the factory is persisted', function () {
    $user = User::factory()->create(['name' => 'Persisted User']);

    expect(User::query()->find($user->id)?->name)->toBe('Persisted User');
});
