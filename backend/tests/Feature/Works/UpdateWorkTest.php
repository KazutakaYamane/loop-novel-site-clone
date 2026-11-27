<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Work;

/**
 * @return array<string, mixed>
 */
function workSettings(array $overrides = []): array
{
    return array_merge([
        'title' => '変更後のタイトル',
        'catchphrase' => '心に残る一行',
        'introduction' => '変更後の紹介文。',
        'genre' => 'mystery',
        'tags' => ['探偵', '学園'],
        'rating_cruel' => true,
        'rating_violent' => false,
        'rating_sexual' => true,
        'serial_status' => 'completed',
    ], $overrides);
}

test('the owner changes every setting of a work', function () {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create();

    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", workSettings())
        ->assertOk()
        ->assertExactJson([
            'id' => $work->id,
            'title' => '変更後のタイトル',
            'catchphrase' => '心に残る一行',
            'introduction' => '変更後の紹介文。',
            'genre' => 'mystery',
            'tags' => ['探偵', '学園'],
            'rating_cruel' => true,
            'rating_violent' => false,
            'rating_sexual' => true,
            'serial_status' => 'completed',
        ]);

    $this->actingAs($user)->getJson("/api/my/works/{$work->id}")
        ->assertOk()
        ->assertJson(['title' => '変更後のタイトル', 'genre' => 'mystery', 'tags' => ['探偵', '学園'], 'serial_status' => 'completed']);
})->group('AC-F3-2');

test('saving again replaces the tags in the given order', function () {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create();
    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", workSettings(['tags' => ['一', '二', '三']]))->assertOk();

    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", workSettings(['tags' => ['三', '四']]))
        ->assertOk()
        ->assertJson(['tags' => ['三', '四']]);

    expect($work->tags()->count())->toBe(2);
})->group('AC-F3-2');

test('the optional settings can be cleared again', function () {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create();
    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", workSettings())->assertOk();

    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", workSettings([
        'catchphrase' => '',
        'introduction' => '',
        'genre' => null,
        'tags' => [],
        'rating_cruel' => false,
        'rating_sexual' => false,
        'serial_status' => 'running',
    ]))->assertOk()->assertJson([
        'catchphrase' => null,
        'introduction' => null,
        'genre' => null,
        'tags' => [],
        'rating_cruel' => false,
        'rating_violent' => false,
        'rating_sexual' => false,
        'serial_status' => 'running',
    ]);
})->group('AC-F3-2');

test('each self rating is kept on its own', function (string $rating) {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create();
    $settings = workSettings(['rating_cruel' => false, 'rating_violent' => false, 'rating_sexual' => false, $rating => true]);

    $response = $this->actingAs($user)->putJson("/api/my/works/{$work->id}", $settings)->assertOk();

    foreach (['rating_cruel', 'rating_violent', 'rating_sexual'] as $field) {
        expect($response->json($field))->toBe($field === $rating);
    }
})->with(['rating_cruel', 'rating_violent', 'rating_sexual'])->group('AC-F3-2');

test('the settings must be complete and valid', function (array $overrides, string $field) {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create(['title' => '元のタイトル']);

    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", workSettings($overrides))
        ->assertUnprocessable()
        ->assertJsonValidationErrorFor($field);

    expect($work->fresh()?->title)->toBe('元のタイトル');
})->with([
    'unknown genre' => [['genre' => 'western'], 'genre'],
    'unknown serial status' => [['serial_status' => 'paused'], 'serial_status'],
    'missing serial status' => [['serial_status' => null], 'serial_status'],
    'rating that is not yes or no' => [['rating_violent' => 'maybe'], 'rating_violent'],
    'missing rating' => [['rating_cruel' => null], 'rating_cruel'],
    'missing sexual rating' => [['rating_sexual' => null], 'rating_sexual'],
    'tags that are not a list' => [['tags' => '探偵'], 'tags'],
    'a tag that is not text' => [['tags' => [['探偵']]], 'tags.0'],
    'an empty tag' => [['tags' => ['探偵', '']], 'tags.1'],
    'missing title' => [['title' => ''], 'title'],
    'a title that is not text' => [['title' => ['題']], 'title'],
    'a catchphrase that is not text' => [['catchphrase' => ['一行']], 'catchphrase'],
    'an introduction that is not text' => [['introduction' => ['紹介']], 'introduction'],
])->group('AC-F3-2');

test('the edit form shows the current settings of my work', function () {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create(['title' => '今のタイトル', 'introduction' => '今の紹介文']);

    $this->actingAs($user)->getJson("/api/my/works/{$work->id}")
        ->assertOk()
        ->assertJson(['id' => $work->id, 'title' => '今のタイトル', 'introduction' => '今の紹介文']);
})->group('AC-F3-2');

test('a work that does not exist is not found', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->getJson('/api/my/works/999999')->assertNotFound();
    $this->actingAs($user)->putJson('/api/my/works/999999', workSettings())->assertNotFound();
})->group('AC-F3-2');

test('the genre choices come from the api in the order of the form', function () {
    $response = $this->getJson('/api/genres')->assertOk();

    expect($response->json('data.0'))->toBe(['value' => 'fantasy', 'label' => '異世界ファンタジー'])
        ->and($response->json('data.11'))->toBe(['value' => 'others', 'label' => '詩・童話・その他'])
        ->and($response->json('data'))->toHaveCount(12);
})->group('AC-F3-3');

test('the settings must include the tags, even when there are none', function () {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create();
    $settings = workSettings();
    unset($settings['tags']);

    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", $settings)
        ->assertUnprocessable()
        ->assertJsonValidationErrorFor('tags');
})->group('AC-F3-2');

// distinct は文字列が完全に一致するタグだけを同じとみなす。DB の一意の制約も同じ基準でないと、保存が 500 で落ちる
test('tags that differ only in letter case or kana are kept as different tags', function () {
    $user = User::factory()->create();
    $work = Work::factory()->for($user)->create();

    $this->actingAs($user)->putJson("/api/my/works/{$work->id}", workSettings(['tags' => ['SF', 'sf', 'ファンタジー', 'ふぁんたじー']]))
        ->assertOk()
        ->assertJson(['tags' => ['SF', 'sf', 'ファンタジー', 'ふぁんたじー']]);

    expect($work->tags()->pluck('name')->all())->toBe(['SF', 'sf', 'ファンタジー', 'ふぁんたじー']);
})->group('AC-F3-2');
