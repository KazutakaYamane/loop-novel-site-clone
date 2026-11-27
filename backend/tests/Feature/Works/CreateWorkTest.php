<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Work;

test('a logged-in user creates a work from a title and an introduction', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->postJson('/api/my/works', [
        'title' => '星を数える旅',
        'introduction' => '夜空の星を数えて旅をする話。',
    ]);

    $work = Work::sole();
    $response->assertCreated()->assertExactJson([
        'id' => $work->id,
        'title' => '星を数える旅',
        'catchphrase' => null,
        'introduction' => '夜空の星を数えて旅をする話。',
        'genre' => null,
        'tags' => [],
        'rating_cruel' => false,
        'rating_violent' => false,
        'rating_sexual' => false,
        'serial_status' => 'running',
    ]);
    expect($work->user_id)->toBe($user->id);
})->group('AC-F3-1');

test('the owner is the logged-in user even when the request names another', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();

    $this->actingAs($user)->postJson('/api/my/works', [
        'title' => '自分の作品',
        'introduction' => '紹介文',
        'user_id' => $other->id,
    ])->assertCreated();

    expect(Work::sole()->user_id)->toBe($user->id);
})->group('AC-F3-1');

test('a work needs a title', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/my/works', ['title' => '   ', 'introduction' => '紹介文'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['title' => '小説タイトルを入力してください。']);

    expect(Work::count())->toBe(0);
})->group('AC-F3-1');

test('a guest cannot create a work', function () {
    $this->postJson('/api/my/works', ['title' => 'ゲストの作品', 'introduction' => '紹介文'])
        ->assertUnauthorized();

    expect(Work::count())->toBe(0);
})->group('AC-F3-1');

test('the workspace lists only my works, the latest update first', function () {
    $user = User::factory()->create();
    $older = Work::factory()->for($user)->create(['title' => '古い作品', 'updated_at' => now()->subDay()]);
    $newer = Work::factory()->for($user)->create(['title' => '新しい作品', 'updated_at' => now()]);
    Work::factory()->create(['title' => '他人の作品']);

    $response = $this->actingAs($user)->getJson('/api/my/works')->assertOk();

    expect($response->json('data.*.id'))->toBe([$newer->id, $older->id])
        ->and($response->json('data.*.title'))->toBe(['新しい作品', '古い作品']);
})->group('AC-F3-1');

test('a guest has no workspace', function () {
    $this->getJson('/api/my/works')->assertUnauthorized();
})->group('AC-F3-1');

test('works updated at the same time are listed newest first', function () {
    $user = User::factory()->create();
    $at = now()->startOfSecond();
    $first = Work::factory()->for($user)->create(['updated_at' => $at]);
    $second = Work::factory()->for($user)->create(['updated_at' => $at]);

    $this->actingAs($user)->getJson('/api/my/works')
        ->assertOk()
        ->assertJsonPath('data.0.id', $second->id)
        ->assertJsonPath('data.1.id', $first->id);
})->group('AC-F3-1');
