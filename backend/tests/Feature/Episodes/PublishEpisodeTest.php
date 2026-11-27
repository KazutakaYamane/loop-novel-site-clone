<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->work = Work::factory()->for($this->owner)->create();
    $this->episode = Episode::factory()->for($this->work)->create(['title' => '下書き', 'body' => '下書きの本文']);
});

afterEach(function () {
    Carbon::setTestNow();
});

test('the owner publishes a draft with the content in the form', function () {
    Carbon::setTestNow('2026-11-27 12:34:56');

    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}/publication", ['title' => '公開するタイトル', 'body' => '公開する本文'])
        ->assertOk()
        ->assertJson([
            'id' => $this->episode->id,
            'title' => '公開するタイトル',
            'body' => '公開する本文',
            'status' => 'published',
            'published_at' => '2026-11-27T12:34:56+00:00',
        ]);

    $fresh = $this->episode->fresh();
    expect($fresh?->status->value)->toBe('published')
        ->and($fresh?->title)->toBe('公開するタイトル')
        ->and($fresh?->body)->toBe('公開する本文')
        ->and($fresh?->published_at?->equalTo(Carbon::parse('2026-11-27 12:34:56')))->toBeTrue();
})->group('AC-F4-6');

test('an episode with an empty body cannot be published', function (mixed $body) {
    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}/publication", ['title' => '空の本文', 'body' => $body])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['body' => '本文が空のエピソードは公開できません。']);

    $fresh = $this->episode->fresh();
    expect($fresh?->status->value)->toBe('draft')
        ->and($fresh?->published_at)->toBeNull()
        ->and($fresh?->body)->toBe('下書きの本文');
})->with([[''], [null], ["\n\n"], ["\u{3000} \n"]])->group('AC-F4-6');

test('an episode that is already published is not published again', function () {
    $published = Episode::factory()->for($this->work)->published()->create(['title' => '公開済み', 'body' => '公開した本文']);
    $publishedAt = $published->published_at;

    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes/{$published->id}/publication", ['title' => '書き換え', 'body' => '書き換え'])
        ->assertConflict()
        ->assertJson(['message' => '公開済みのエピソードは編集できません。']);

    $fresh = $published->fresh();
    expect($fresh?->title)->toBe('公開済み')
        ->and($fresh?->published_at?->equalTo($publishedAt))->toBeTrue();
})->group('AC-F4-6');
