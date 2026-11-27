<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;

// 所有者が公開した直後に、ゲストが読む API に話と作品が出る
it('shows the first published episode and its work to guests right after publishing', function (): void {
    $owner = User::factory()->create();
    $work = Work::factory()->for($owner)->create(['title' => '初めて公開する作品']);
    $draft = Episode::factory()->for($work)->create(['title' => '下書き', 'body' => '本文']);

    $this->getJson('/api/new-arrivals')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson("/api/works/{$work->id}")->assertNotFound();

    $this->actingAs($owner)
        ->postJson("/api/my/works/{$work->id}/episodes/{$draft->id}/publication", ['title' => '第1話', 'body' => '本文'])
        ->assertOk();
    $this->app['auth']->forgetGuards();
    $this->flushSession();

    $this->getJson('/api/new-arrivals')->assertOk()->assertJsonPath('data.0.id', $work->id);
    $this->getJson("/api/works/{$work->id}")->assertOk()->assertJsonPath('data.episodes.0.title', '第1話');
    $this->getJson("/api/works/{$work->id}/episodes/{$draft->id}")->assertOk()->assertJsonPath('data.title', '第1話');
})->group('AC-F4-4', 'AC-F4-5');

it('moves a work to the top of the new arrivals when another of its drafts is published', function (): void {
    $owner = User::factory()->create();
    $work = Work::factory()->for($owner)->create();
    Episode::factory()->for($work)->published()->create(['published_at' => now()->subDay()]);
    $draft = Episode::factory()->for($work)->create();
    $newer = Work::factory()->create();
    Episode::factory()->for($newer)->published()->create(['published_at' => now()->subHour()]);

    expect($this->getJson('/api/new-arrivals')->json('data.*.id'))->toBe([$newer->id, $work->id]);

    $this->actingAs($owner)
        ->postJson("/api/my/works/{$work->id}/episodes/{$draft->id}/publication", ['title' => '第2話', 'body' => '続き'])
        ->assertOk();
    $this->app['auth']->forgetGuards();
    $this->flushSession();

    expect($this->getJson('/api/new-arrivals')->json('data.*.id'))->toBe([$work->id, $newer->id]);
    $this->getJson("/api/works/{$work->id}")->assertOk()->assertJsonPath('data.episodes.1.title', '第2話');
})->group('AC-F4-4');
