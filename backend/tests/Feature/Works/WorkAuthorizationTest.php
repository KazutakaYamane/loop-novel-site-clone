<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Work;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

/**
 * @return array<string, mixed>
 */
function intrusionSettings(): array
{
    return [
        'title' => '書き換えられたタイトル',
        'catchphrase' => '書き換え',
        'introduction' => '書き換えられた紹介文',
        'genre' => 'horror',
        'tags' => ['乗っ取り'],
        'rating_cruel' => true,
        'rating_violent' => true,
        'rating_sexual' => true,
        'serial_status' => 'completed',
    ];
}

function expectWorkUntouched(Work $work): void
{
    $fresh = $work->fresh();
    expect($fresh?->title)->toBe('持ち主のタイトル')
        ->and($fresh?->introduction)->toBe('持ち主の紹介文')
        ->and($fresh?->tags()->count())->toBe(0);
}

beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->work = Work::factory()->for($this->owner)->create(['title' => '持ち主のタイトル', 'introduction' => '持ち主の紹介文']);
});

test('another user cannot open the settings of my work', function () {
    $this->actingAs(User::factory()->create())
        ->getJson("/api/my/works/{$this->work->id}")
        ->assertForbidden();
})->group('AC-F3-4');

test('another user cannot change my work', function () {
    $this->actingAs(User::factory()->create())
        ->putJson("/api/my/works/{$this->work->id}", intrusionSettings())
        ->assertForbidden();

    expectWorkUntouched($this->work);
})->group('AC-F3-4');

test('another user does not see my work in their workspace', function () {
    $this->actingAs(User::factory()->create())
        ->getJson('/api/my/works')
        ->assertOk()
        ->assertExactJson(['data' => []]);
})->group('AC-F3-4');

test('a guest cannot open or change a work', function () {
    $this->getJson("/api/my/works/{$this->work->id}")->assertUnauthorized();
    $this->putJson("/api/my/works/{$this->work->id}", intrusionSettings())->assertUnauthorized();

    expectWorkUntouched($this->work);
})->group('AC-F3-4');

describe('csrf', function () {
    // フレームワークは単体テストの実行中だけ CSRF の検証を飛ばす。その判定だけを外して、本物の検証を通す
    beforeEach(function () {
        $this->app->singleton(PreventRequestForgery::class, fn ($app) => new class($app, $app['encrypter']) extends PreventRequestForgery
        {
            protected function runningUnitTests()
            {
                return false;
            }
        });
    });

    test('the owner changes the work with the session csrf token', function () {
        $this->actingAs($this->owner)
            ->withSession(['_token' => 'session-token'])
            ->withHeader('X-CSRF-TOKEN', 'session-token')
            ->putJson("/api/my/works/{$this->work->id}", intrusionSettings())
            ->assertOk();

        expect($this->work->fresh()?->title)->toBe('書き換えられたタイトル');
    })->group('AC-F3-4');

    test('a change without a valid csrf token is rejected even for the owner', function (array $headers) {
        $this->actingAs($this->owner)
            ->withSession(['_token' => 'session-token'])
            ->withHeaders($headers)
            ->putJson("/api/my/works/{$this->work->id}", intrusionSettings())
            ->assertStatus(419);

        expectWorkUntouched($this->work);
    })->with([
        'missing' => [[]],
        'forged' => [['X-CSRF-TOKEN' => str_repeat('a', 40)]],
        'from another site' => [['Sec-Fetch-Site' => 'cross-site', 'Origin' => 'https://evil.example']],
    ])->group('AC-F3-4');

    test('creating a work without a csrf token is rejected', function () {
        $this->actingAs($this->owner)
            ->withSession(['_token' => 'session-token'])
            ->postJson('/api/my/works', ['title' => '偽の作品', 'introduction' => '紹介文'])
            ->assertStatus(419);

        expect(Work::count())->toBe(1);
    })->group('AC-F3-4');
});
