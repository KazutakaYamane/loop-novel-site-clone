<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

// 話の作成・編集の送信は、利用者ごとに 10 分間 30 回まで(docs/adr/0023)
beforeEach(function () {
    $this->owner = User::factory()->create();
    $this->work = Work::factory()->for($this->owner)->create();
    $this->episode = Episode::factory()->for($this->work)->create(['title' => '下書き', 'body' => '本文']);
});

function saveDraftAs(User $user, Work $work, Episode $episode, string $title = '保存し直し'): Illuminate\Testing\TestResponse
{
    return test()->actingAs($user)->putJson("/api/my/works/{$work->id}/episodes/{$episode->id}", ['title' => $title, 'body' => '本文']);
}

test('thirty submissions in ten minutes succeed and the thirty-first is refused', function () {
    for ($i = 1; $i <= 30; $i++) {
        saveDraftAs($this->owner, $this->work, $this->episode, "保存{$i}")->assertOk();
    }

    saveDraftAs($this->owner, $this->work, $this->episode, '拒まれる保存')->assertStatus(429);

    expect($this->episode->fresh()?->title)->toBe('保存30');
})->group('AC-F4-9');

test('creating, saving again, and publishing are counted together', function () {
    for ($i = 1; $i <= 10; $i++) {
        $this->actingAs($this->owner)->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => "新しい話{$i}", 'body' => ''])->assertCreated();
    }
    for ($i = 1; $i <= 19; $i++) {
        saveDraftAs($this->owner, $this->work, $this->episode)->assertOk();
    }
    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}/publication", ['title' => '公開', 'body' => '本文'])
        ->assertOk();

    $this->actingAs($this->owner)->postJson("/api/my/works/{$this->work->id}/episodes", ['title' => '拒まれる話', 'body' => ''])->assertStatus(429);

    expect(Episode::count())->toBe(11);
})->group('AC-F4-9');

test('a refused submission does not publish the episode', function () {
    for ($i = 1; $i <= 30; $i++) {
        saveDraftAs($this->owner, $this->work, $this->episode)->assertOk();
    }

    $this->actingAs($this->owner)
        ->postJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}/publication", ['title' => '公開', 'body' => '本文'])
        ->assertStatus(429);

    expect($this->episode->fresh()?->status->value)->toBe('draft');
})->group('AC-F4-9');

test('reading episodes is not counted', function () {
    for ($i = 1; $i <= 31; $i++) {
        $this->actingAs($this->owner)->getJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}")->assertOk();
    }

    saveDraftAs($this->owner, $this->work, $this->episode)->assertOk();
})->group('AC-F4-9');

test('the limit is counted for each user', function () {
    for ($i = 1; $i <= 30; $i++) {
        saveDraftAs($this->owner, $this->work, $this->episode)->assertOk();
    }
    saveDraftAs($this->owner, $this->work, $this->episode)->assertStatus(429);

    $other = User::factory()->create();
    $otherWork = Work::factory()->for($other)->create();
    $otherEpisode = Episode::factory()->for($otherWork)->create();
    saveDraftAs($other, $otherWork, $otherEpisode)->assertOk();
})->group('AC-F4-9');

test('the limit is counted for each user even from the same IP address', function () {
    $other = User::factory()->create();
    $otherWork = Work::factory()->for($other)->create();
    $otherEpisode = Episode::factory()->for($otherWork)->create();

    for ($i = 1; $i <= 30; $i++) {
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.20']);
        saveDraftAs($this->owner, $this->work, $this->episode)->assertOk();
    }

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.20']);
    saveDraftAs($other, $otherWork, $otherEpisode)->assertOk();
    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.21']);
    saveDraftAs($this->owner, $this->work, $this->episode)->assertStatus(429);
})->group('AC-F4-9');

test('the limit is lifted ten minutes after the first submission and not before', function () {
    $this->freezeSecond();
    for ($i = 1; $i <= 30; $i++) {
        saveDraftAs($this->owner, $this->work, $this->episode)->assertOk();
    }

    $this->travel(599)->seconds();
    saveDraftAs($this->owner, $this->work, $this->episode)->assertStatus(429);

    $this->travel(1)->seconds();
    saveDraftAs($this->owner, $this->work, $this->episode)->assertOk();
})->group('AC-F4-9');

test('a guest is refused as unauthenticated, not counted', function () {
    for ($i = 1; $i <= 31; $i++) {
        $this->putJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}", ['title' => 'ゲスト', 'body' => '本文'])
            ->assertUnauthorized();
    }

    expect($this->episode->fresh()?->title)->toBe('下書き');
})->group('AC-F4-9');

test('submissions another user sends to my episode are counted for that user, not for me', function () {
    $other = User::factory()->create();
    for ($i = 1; $i <= 30; $i++) {
        saveDraftAs($other, $this->work, $this->episode)->assertForbidden();
    }
    saveDraftAs($other, $this->work, $this->episode)->assertStatus(429);

    saveDraftAs($this->owner, $this->work, $this->episode, '持ち主の保存')->assertOk();
    expect($this->episode->fresh()?->title)->toBe('持ち主の保存');
})->group('AC-F4-9');

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

    test('submissions without a valid csrf token are rejected and not counted', function (array $headers) {
        for ($i = 1; $i <= 31; $i++) {
            $this->actingAs($this->owner)->withSession(['_token' => 'session-token'])->withHeaders($headers)
                ->putJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}", ['title' => '偽物', 'body' => '本文'])
                ->assertStatus(419);
        }

        $this->actingAs($this->owner)->withSession(['_token' => 'session-token'])->withHeaders(['X-CSRF-TOKEN' => 'session-token'])
            ->putJson("/api/my/works/{$this->work->id}/episodes/{$this->episode->id}", ['title' => '本物', 'body' => '本文'])
            ->assertOk();
        expect($this->episode->fresh()?->title)->toBe('本物');
    })->with([
        'missing' => [[]],
        'forged' => [['X-CSRF-TOKEN' => str_repeat('a', 40)]],
    ])->group('AC-F4-9');
});
