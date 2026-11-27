<?php

declare(strict_types=1);

use App\Models\User;

test('demo users of the same role get names that tell them apart', function (string $role, string $prefix) {
    $first = $this->postJson('/api/demo-sessions', ['role' => $role])->assertCreated()->json('name');
    $this->flushSession();
    $second = $this->postJson('/api/demo-sessions', ['role' => $role])->assertCreated()->json('name');

    expect($first)->toStartWith($prefix)
        ->and($second)->toStartWith($prefix)
        ->and($first)->not->toBe($second)
        ->and(User::query()->orderBy('id')->pluck('name')->all())->toBe([$first, $second]);
})->with([['reader', 'デモ読者'], ['author', 'デモ作者']])->group('AC-F2-3');

test('every demo name in a list is unique', function () {
    foreach (['reader', 'author', 'reader', 'author', 'reader'] as $role) {
        $this->flushSession();
        $this->postJson('/api/demo-sessions', ['role' => $role])->assertCreated();
    }

    $names = User::query()->pluck('name');
    expect($names->unique()->count())->toBe(5);
})->group('AC-F2-3');

test('the name returned by the demo login is the stored name', function () {
    $name = $this->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated()->json('name');

    expect(User::sole()->name)->toBe($name);
})->group('AC-F2-3');
