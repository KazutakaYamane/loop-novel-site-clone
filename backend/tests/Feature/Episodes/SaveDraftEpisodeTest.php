<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;

beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->work = Work::factory()->for($this->owner)->create();
});

test('the owner saves a new episode as a draft', function () {
    $response = $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => '第1話 はじまり', 'body' => "一行目\n二行目"]);

    $response->assertCreated()
        ->assertJson([
            'work_id' => $this->work->id,
            'title' => '第1話 はじまり',
            'body' => "一行目\n二行目",
            'status' => 'draft',
            'published_at' => null,
        ]);
    $episode = Episode::sole();
    expect($response->json('id'))->toBe($episode->id)
        ->and($episode->work_id)->toBe($this->work->id)
        ->and($episode->title)->toBe('第1話 はじまり')
        ->and($episode->body)->toBe("一行目\n二行目")
        ->and($episode->status->value)->toBe('draft')
        ->and($episode->published_at)->toBeNull();
})->group('AC-F4-1');

test('a draft can be saved with an empty body', function () {
    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => '本文はまだ', 'body' => ''])
        ->assertCreated()
        ->assertJson(['body' => '', 'status' => 'draft']);

    expect(Episode::sole()->body)->toBe('');
})->group('AC-F4-1');

test('the body keeps its leading full-width spaces and blank lines', function () {
    $body = "\u{3000}書き出しの段落。\n\n\u{3000}次の段落。\n";

    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => '字下げ', 'body' => $body])
        ->assertCreated()
        ->assertJson(['body' => $body]);

    expect(Episode::sole()->body)->toBe($body);
})->group('AC-F4-1');

test('a title is required', function (mixed $title) {
    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => $title, 'body' => '本文'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['title' => 'エピソードタイトルを入力してください。']);

    expect(Episode::count())->toBe(0);
})->with([[''], [null], [['配列']]])->group('AC-F4-1');

test('the owner opens a draft to edit it', function () {
    $episode = Episode::factory()->for($this->work)->create(['title' => '下書き', 'body' => '途中まで']);

    $this->actingAs($this->owner)
        ->getJson("/api/my/works/{$this->work->id}/episodes/{$episode->id}")
        ->assertOk()
        ->assertJson(['id' => $episode->id, 'title' => '下書き', 'body' => '途中まで', 'status' => 'draft']);
})->group('AC-F4-2');

test('the owner saves a draft again and again', function () {
    $episode = Episode::factory()->for($this->work)->create(['title' => '一回目', 'body' => '一回目の本文']);

    foreach (['二回目', '三回目'] as $title) {
        $this->actingAs($this->owner)
            ->putJson("/api/my/works/{$this->work->id}/episodes/{$episode->id}", ['title' => $title, 'body' => "{$title}の本文"])
            ->assertOk()
            ->assertJson(['title' => $title, 'body' => "{$title}の本文", 'status' => 'draft', 'published_at' => null]);
    }

    $fresh = Episode::sole();
    expect($fresh->title)->toBe('三回目')
        ->and($fresh->body)->toBe('三回目の本文')
        ->and($fresh->status->value)->toBe('draft');
})->group('AC-F4-2');

test('saving a draft with an invalid title keeps the previous version', function () {
    $episode = Episode::factory()->for($this->work)->create(['title' => '前のタイトル', 'body' => '前の本文']);

    $this->actingAs($this->owner)
        ->putJson("/api/my/works/{$this->work->id}/episodes/{$episode->id}", ['title' => '', 'body' => '新しい本文'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('title');

    expect($episode->fresh()?->body)->toBe('前の本文');
})->group('AC-F4-2');

test('a published episode is not edited by saving a draft', function () {
    $episode = Episode::factory()->for($this->work)->published()->create(['title' => '公開済み', 'body' => '公開した本文']);

    $this->actingAs($this->owner)
        ->putJson("/api/my/works/{$this->work->id}/episodes/{$episode->id}", ['title' => '書き換え', 'body' => '書き換えた本文'])
        ->assertConflict()
        ->assertJson(['message' => '公開済みのエピソードは編集できません。']);

    $fresh = $episode->fresh();
    expect($fresh?->title)->toBe('公開済み')
        ->and($fresh?->status->value)->toBe('published');
})->group('AC-F4-2');

test('an episode of another work is not found through this work', function () {
    $otherWork = Work::factory()->for($this->owner)->create();
    $episode = Episode::factory()->for($otherWork)->create();

    $this->actingAs($this->owner)
        ->getJson("/api/my/works/{$this->work->id}/episodes/{$episode->id}")
        ->assertNotFound();
})->group('AC-F4-2');
