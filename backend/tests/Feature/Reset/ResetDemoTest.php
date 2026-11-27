<?php

declare(strict_types=1);

use App\Enums\EpisodeStatus;
use App\Models\Episode;
use App\Models\User;
use App\Models\Work;
use App\Providers\EpisodeRateLimitServiceProvider;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;

test('the demo reset is scheduled for 04:00 in Tokyo each day', function () {
    $event = collect(app(Schedule::class)->events())->first(
        fn ($event) => is_string($event->command) && str_contains($event->command, 'app:reset'),
    );

    expect($event)->not->toBeNull();
    foreach (['2026-11-28', '2026-11-29'] as $day) {
        $this->travelTo(now()->parse("$day 03:59:00", 'Asia/Tokyo'));
        expect($event->isDue($this->app))->toBeFalse();
        $this->travel(1)->minute();
        expect($event->isDue($this->app))->toBeTrue();
        $this->travel(1)->minute();
        expect($event->isDue($this->app))->toBeFalse();
    }
})->group('AC-F9-1');

test('the reset command restores the seed and clears sessions, cache and both rate limits', function () {
    Http::preventStrayRequests();
    $this->seed();
    $seedWork = Work::query()->firstOrFail();
    $seedWork->update(['rating_cruel' => true, 'rating_violent' => true, 'rating_sexual' => true]);
    $seedAuthor = User::query()->findOrFail($seedWork->user_id);
    $unseededWork = Work::factory()->for($seedAuthor)->create();

    $author = User::factory()->create();
    $work = Work::factory()->for($author)->create();
    $this->actingAs($author)->postJson("/api/my/works/{$work->id}/episodes", [
        'title' => '下書き', 'body' => '',
    ])->assertCreated();
    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.10'])
        ->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated();
    DB::table('sessions')->insert([
        'id' => 'old-session', 'user_id' => $author->id, 'payload' => '', 'last_activity' => time(),
    ]);
    Cache::put('demo-temporary-data', 'temporary');
    $keys = [md5('demo-login203.0.113.10'), md5(EpisodeRateLimitServiceProvider::LIMITER.$author->id)];
    foreach ($keys as $key) {
        expect(RateLimiter::attempts($key))->toBe(1);
    }

    $this->artisan('app:reset')->assertSuccessful();

    expect(User::query()->whereKey($author->id)->exists())->toBeFalse()
        ->and(Work::query()->whereKey($unseededWork->id)->exists())->toBeFalse()
        ->and(Work::count())->toBe(15)
        ->and(DB::table('sessions')->count())->toBe(0)
        ->and(Cache::has('demo-temporary-data'))->toBeFalse();
    $seedWork->refresh();
    expect($seedWork->rating_cruel)->toBeFalse()
        ->and($seedWork->rating_violent)->toBeFalse()
        ->and($seedWork->rating_sexual)->toBeFalse();
    foreach ($keys as $key) {
        expect(RateLimiter::attempts($key))->toBe(0)
            ->and(RateLimiter::availableIn($key))->toBe(0);
    }
})->group('AC-F9-1', 'AC-F9-2');

test('the public APIs serve the original seed links immediately after reset and the removed links return 404', function () {
    $this->seed();
    $seedWork = Work::query()->firstOrFail();
    $seedEpisode = $seedWork->episodes()->firstOrFail();
    $work = Work::factory()->for(User::factory())->create(['title' => 'リセット前の作品']);
    $episode = Episode::factory()->for($work)->create([
        'status' => EpisodeStatus::Published,
        'published_at' => now(),
        'title' => 'リセット前に公開した話',
    ]);
    $currentArrivals = $this->getJson('/api/new-arrivals')->assertOk();
    expect($currentArrivals->json('data.0.title'))->toBe($work->title);
    $this->getJson("/api/works/{$work->id}/episodes/{$episode->id}")->assertOk();

    $this->artisan('app:reset')->assertSuccessful();

    $this->getJson('/api/new-arrivals')->assertOk()
        ->assertJsonCount(15, 'data')->assertJsonMissing(['title' => $work->title]);
    $this->getJson("/api/works/{$work->id}")->assertNotFound();
    $this->getJson("/api/works/{$work->id}/episodes/{$episode->id}")->assertNotFound();
    $this->getJson("/api/works/{$seedWork->id}")->assertOk()->assertJsonFragment(['title' => $seedWork->title]);
    $this->getJson("/api/works/{$seedWork->id}/episodes/{$seedEpisode->id}")
        ->assertOk()->assertJsonFragment(['title' => $seedEpisode->title]);
})->group('AC-F9-3');

test('a cache reset failure rolls back the demo data changes', function () {
    $author = User::factory()->create();
    $work = Work::factory()->for($author)->create();

    Cache::shouldReceive('flush')->once()->andReturnFalse();

    expect(fn () => $this->artisan('app:reset')->execute())->toThrow(RuntimeException::class, 'Could not clear the demo cache.');

    expect(Work::query()->whereKey($work->id)->exists())->toBeTrue()
        ->and(User::query()->whereKey($author->id)->exists())->toBeTrue()
        ->and(Work::count())->toBe(1);
})->group('AC-F9-2');
