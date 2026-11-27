<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;

beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->work = Work::factory()->for($this->owner)->create();
});

test('a body of 100000 characters, such as a line of 100000 《, is saved and published', function () {
    $body = str_repeat('《', 100000);

    $created = $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => '長い行', 'body' => $body])
        ->assertCreated();
    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes/{$created->json('id')}/publication", ['title' => '長い行', 'body' => $body])
        ->assertOk()
        ->assertJson(['status' => 'published']);

    expect(Episode::sole()->body)->toBe($body);
})->group('AC-F4-1');

test('a body over 100000 characters is rejected with a message', function () {
    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => '長すぎる', 'body' => str_repeat('あ', 100001)])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['body' => '本文は100000文字以内で入力してください。']);

    expect(Episode::count())->toBe(0);
})->group('AC-F4-1');

test('a title over 100 characters is rejected with a message', function () {
    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => str_repeat('あ', 101), 'body' => '本文'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['title' => 'エピソードタイトルは100文字以内で入力してください。']);

    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => str_repeat('あ', 100), 'body' => '本文'])
        ->assertCreated();
})->group('AC-F4-1');
