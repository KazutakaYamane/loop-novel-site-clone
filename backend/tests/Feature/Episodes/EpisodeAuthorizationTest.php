<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

function expectEpisodeUntouched(Episode $episode): void
{
    $fresh = $episode->fresh();
    expect($fresh?->title)->toBe('持ち主の下書き')
        ->and($fresh?->body)->toBe('持ち主の本文')
        ->and($fresh?->status->value)->toBe('draft')
        ->and($fresh?->published_at)->toBeNull();
}

beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->work = Work::factory()->for($this->owner)->create();
    $this->episode = Episode::factory()->for($this->work)->create(['title' => '持ち主の下書き', 'body' => '持ち主の本文']);
    $this->intrusion = ['title' => '乗っ取り', 'body' => '乗っ取りの本文'];
});

test('another user cannot create an episode in my work', function () {
    $this->actingAs(User::factory()->create())
        ->postJson("/api/my/works/{$this->work->id}/episodes", $this->intrusion)
        ->assertForbidden();

    expect(Episode::count())->toBe(1);
})->group('AC-F4-7');

test('another user cannot open, edit, or publish my episode', function () {
    $other = User::factory()->create();

    $this->actingAs($other)->getJson("/api/my/works/{$this->work->id}/episodes")->assertForbidden();
    $this->actingAs($other)->getJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}")->assertForbidden();
    $this->actingAs($other)->putJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}", $this->intrusion)->assertForbidden();
    $this->actingAs($other)->postJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}/publication", $this->intrusion)->assertForbidden();

    expectEpisodeUntouched($this->episode);
})->group('AC-F4-7');

test('another user cannot reach my episode through their own work', function () {
    $other = User::factory()->create();
    $otherWork = Work::factory()->for($other)->create();

    $this->actingAs($other)->putJson("/api/my/works/{$otherWork->id}/episodes/{$this->episode->id}", $this->intrusion)->assertNotFound();
    $this->actingAs($other)->postJson("/api/my/works/{$otherWork->id}/episodes/{$this->episode->id}/publication", $this->intrusion)->assertNotFound();

    expectEpisodeUntouched($this->episode);
})->group('AC-F4-7');

test('a guest cannot create, open, edit, or publish an episode', function () {
    $this->postJson("/api/my/works/{$this->work->id}/episodes", $this->intrusion)->assertUnauthorized();
    $this->getJson("/api/my/works/{$this->work->id}/episodes")->assertUnauthorized();
    $this->getJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}")->assertUnauthorized();
    $this->putJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}", $this->intrusion)->assertUnauthorized();
    $this->postJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}/publication", $this->intrusion)->assertUnauthorized();

    expect(Episode::count())->toBe(1);
    expectEpisodeUntouched($this->episode);
})->group('AC-F4-7');

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

    test('the owner saves and publishes with the session csrf token', function () {
        $this->actingAs($this->owner)
            ->withSession(['_token' => 'session-token'])
            ->withHeader('X-CSRF-TOKEN', 'session-token')
            ->postJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}/publication", ['title' => '公開', 'body' => '本文'])
            ->assertOk();

        expect($this->episode->fresh()?->status->value)->toBe('published');
    })->group('AC-F4-7');

    test('creating, editing, or publishing without a valid csrf token is rejected even for the owner', function (array $headers) {
        $request = fn () => $this->actingAs($this->owner)->withSession(['_token' => 'session-token'])->withHeaders($headers);

        $request()->postJson("/api/my/works/{$this->work->id}/episodes", $this->intrusion)->assertStatus(419);
        $request()->putJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}", $this->intrusion)->assertStatus(419);
        $request()->postJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}/publication", $this->intrusion)->assertStatus(419);

        expect(Episode::count())->toBe(1);
        expectEpisodeUntouched($this->episode);
    })->with([
        'missing' => [[]],
        'forged' => [['X-CSRF-TOKEN' => str_repeat('a', 40)]],
        'from another site' => [['Sec-Fetch-Site' => 'cross-site', 'Origin' => 'https://evil.example']],
    ])->group('AC-F4-7');
});
