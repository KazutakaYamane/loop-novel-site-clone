<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Work;

/**
 * @return array<string, mixed>
 */
function limitSettings(array $overrides = []): array
{
    return array_merge([
        'title' => 'タイトル',
        'catchphrase' => null,
        'introduction' => null,
        'genre' => null,
        'tags' => [],
        'rating_cruel' => false,
        'rating_violent' => false,
        'rating_sexual' => false,
        'serial_status' => 'running',
    ], $overrides);
}

test('the settings accept text up to each limit', function () {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create();

    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", limitSettings([
        'title' => str_repeat('あ', 100),
        'catchphrase' => str_repeat('い', 35),
        'introduction' => str_repeat('う', 10000),
        'tags' => array_map(fn (int $i) => str_repeat((string) $i, 20), range(1, 8)),
    ]))->assertOk();

    $work->refresh();
    expect(mb_strlen($work->title))->toBe(100)
        ->and(mb_strlen((string) $work->catchphrase))->toBe(35)
        ->and(mb_strlen((string) $work->introduction))->toBe(10000)
        ->and($work->tags()->count())->toBe(8);
})->group('AC-F3-3');

test('the settings reject text over each limit with a message', function (array $overrides, string $field, string $message) {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create(['title' => '元のタイトル']);

    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", limitSettings($overrides))
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field => $message]);

    expect($work->fresh()?->title)->toBe('元のタイトル')
        ->and($work->tags()->count())->toBe(0);
})->with([
    'title' => [['title' => str_repeat('あ', 101)], 'title', '小説タイトルは100文字以内で入力してください。'],
    'catchphrase' => [['catchphrase' => str_repeat('い', 36)], 'catchphrase', 'キャッチコピーは35文字以内で入力してください。'],
    'introduction' => [['introduction' => str_repeat('う', 10001)], 'introduction', '紹介文は10000文字以内で入力してください。'],
    'too many tags' => [['tags' => array_map(fn (int $i) => "タグ{$i}", range(1, 9))], 'tags', 'タグは8つまで設定できます。'],
    'long tag' => [['tags' => ['短い', str_repeat('え', 21)]], 'tags.1', 'タグは1つ20文字以内で入力してください。'],
    'same tag twice' => [['tags' => ['探偵', '探偵']], 'tags.1', '同じタグを2回設定できません。'],
])->group('AC-F3-3');

test('creating a work rejects text over the limits', function (array $input, string $field, string $message) {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/my/works', $input)
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field => $message]);

    expect(Work::count())->toBe(0);
})->with([
    'title' => [['title' => str_repeat('あ', 101), 'introduction' => '紹介文'], 'title', '小説タイトルは100文字以内で入力してください。'],
    'introduction' => [['title' => 'タイトル', 'introduction' => str_repeat('う', 10001)], 'introduction', '紹介文は10000文字以内で入力してください。'],
    'title that is not text' => [['title' => ['題'], 'introduction' => '紹介文'], 'title', '小説タイトルを入力してください。'],
    'introduction that is not text' => [['title' => 'タイトル', 'introduction' => ['紹介']], 'introduction', '紹介文を文字で入力してください。'],
])->group('AC-F3-3');

test('creating a work accepts text up to the limits', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/my/works', [
        'title' => str_repeat('あ', 100),
        'introduction' => str_repeat('う', 10000),
    ])->assertCreated();

    expect(Work::count())->toBe(1);
})->group('AC-F3-3');
