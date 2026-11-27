<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;

test('a demo author starts with one work that has a published episode and a draft', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'author'])->assertCreated();

    $author = User::sole();
    $work = Work::sole();
    expect($work->user_id)->toBe($author->id)
        ->and($work->title)->not->toBe('')
        ->and($work->introduction)->not->toBeEmpty();
    $episodes = Episode::query()->whereBelongsTo($work)->orderBy('id')->get();
    expect($episodes)->toHaveCount(2)
        ->and($episodes[0]->status->value)->toBe('published')
        ->and($episodes[0]->published_at)->not->toBeNull()
        ->and($episodes[0]->body)->not->toBe('')
        ->and($episodes[1]->status->value)->toBe('draft')
        ->and($episodes[1]->published_at)->toBeNull();
})->group('AC-F2-5');

test('the demo author can open their work and episodes in the workspace', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'author'])->assertCreated();
    $work = Work::sole();

    $this->getJson('/api/my/works')->assertOk()->assertJsonPath('data.*.id', [$work->id]);
    $this->getJson("/api/my/works/{$work->id}/episodes")
        ->assertOk()
        ->assertJsonPath('data.*.status', ['published', 'draft']);
})->group('AC-F2-5');

test('each demo author gets a work of their own', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'author'])->assertCreated();
    $this->postJson('/api/demo-sessions', ['role' => 'author'])->assertCreated();

    $users = User::query()->orderBy('id')->pluck('id')->all();
    expect(Work::query()->orderBy('user_id')->pluck('user_id')->all())->toBe($users)
        ->and(Episode::count())->toBe(4);
})->group('AC-F2-5');

test('a demo reader starts with no work or episode', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated();

    expect(Work::count())->toBe(0)
        ->and(Episode::count())->toBe(0);
})->group('AC-F2-6');
