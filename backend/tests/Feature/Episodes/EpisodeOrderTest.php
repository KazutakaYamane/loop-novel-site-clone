<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;
use Illuminate\Support\Carbon;

afterEach(function () {
    Carbon::setTestNow();
});

test('episodes are listed in the order they were created', function () {
    $owner = User::factory()->create();
    $work = Work::factory()->for($owner)->create();
    Carbon::setTestNow('2026-11-27 10:00:00');
    $this->actingAs($owner)->postJson("/api/my/works/{$work->id}/episodes", ['title' => '一番目', 'body' => '本文'])->assertCreated();
    $this->actingAs($owner)->postJson("/api/my/works/{$work->id}/episodes", ['title' => '二番目', 'body' => '本文'])->assertCreated();
    $this->actingAs($owner)->postJson("/api/my/works/{$work->id}/episodes", ['title' => '三番目', 'body' => '本文'])->assertCreated();
    [$first, $second] = Episode::query()->orderBy('id')->get()->all();
    // 後から公開・保存し直しても、並びは作った順のまま
    Carbon::setTestNow('2026-11-27 11:00:00');
    $this->actingAs($owner)->postJson("/api/my/works/{$work->id}/episodes/{$second->id}/publication", ['title' => '二番目', 'body' => '公開'])->assertOk();
    $this->actingAs($owner)->putJson("/api/my/works/{$work->id}/episodes/{$first->id}", ['title' => '一番目', 'body' => '保存し直し'])->assertOk();

    $this->actingAs($owner)
        ->getJson("/api/my/works/{$work->id}/episodes")
        ->assertOk()
        ->assertJsonPath('data.*.title', ['一番目', '二番目', '三番目'])
        ->assertJsonPath('data.*.status', ['draft', 'published', 'draft']);
})->group('AC-F4-8');

test('the list has only the episodes of that work, without their bodies', function () {
    $owner = User::factory()->create();
    $work = Work::factory()->for($owner)->create();
    $episode = Episode::factory()->for($work)->create(['title' => 'この作品の話']);
    Episode::factory()->for(Work::factory()->for($owner))->create(['title' => '別の作品の話']);

    $this->actingAs($owner)
        ->getJson("/api/my/works/{$work->id}/episodes")
        ->assertOk()
        ->assertExactJson(['data' => [[
            'id' => $episode->id,
            'title' => 'この作品の話',
            'status' => 'draft',
            'published_at' => null,
        ]]]);
})->group('AC-F4-8');
