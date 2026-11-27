<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;
use Illuminate\Support\Carbon;

it('lists works by the time their latest episode was published, newest first', function (): void {
    $author = User::factory()->create(['name' => '灯台の作者']);
    $old = Work::factory()->for($author)->create(['title' => '古い更新', 'catchphrase' => '遠い岸から', 'introduction' => '岬の日誌']);
    $recent = Work::factory()->create(['title' => '新しい更新']);
    $middle = Work::factory()->create(['title' => '中ほどの更新']);
    $oldEpisode = Episode::factory()->for($old)->published()->create(['published_at' => Carbon::parse('2026-11-01 10:00:00')]);
    Episode::factory()->for($recent)->published()->create(['published_at' => Carbon::parse('2026-11-02 10:00:00')]);
    // 話を作った順ではなく、最後に公開された時刻で並ぶ
    Episode::factory()->for($recent)->published()->create(['published_at' => Carbon::parse('2026-11-20 10:00:00')]);
    Episode::factory()->for($middle)->published()->create(['published_at' => Carbon::parse('2026-11-10 10:00:00')]);
    Episode::factory()->for($middle)->create();

    $response = $this->getJson('/api/new-arrivals')->assertOk();

    expect($response->json('data.*.id'))->toBe([$recent->id, $middle->id, $old->id]);
    expect($response->json('data.2'))->toBe([
        'id' => $old->id,
        'title' => '古い更新',
        'catchphrase' => '遠い岸から',
        'introduction' => '岬の日誌',
        'author_name' => '灯台の作者',
        'latest_episode_title' => $oldEpisode->title,
    ]);
})->group('AC-F7-1');

it('returns the latest published title for each work, breaking episode ties by ID', function (): void {
    $work = Work::factory()->create();
    $other = Work::factory()->create();
    $at = Carbon::parse('2026-11-27 12:00:00');
    Episode::factory()->for($work)->published()->create(['title' => '同じ秒の先の話', 'published_at' => $at]);
    Episode::factory()->for($work)->published()->create(['title' => '同じ秒の後の話', 'published_at' => $at]);
    Episode::factory()->for($work)->published()->create(['title' => '先に公開した話', 'published_at' => $at->copy()->subDay()]);
    Episode::factory()->for($work)->create(['title' => '未公開の下書き']);
    Episode::factory()->for($other)->published()->create(['title' => '別の作品の話', 'published_at' => $at->copy()->addDay()]);

    $response = $this->getJson('/api/new-arrivals')->assertOk();

    expect($response->json('data.*.id'))->toBe([$other->id, $work->id])
        ->and($response->json('data.*.latest_episode_title'))->toBe(['別の作品の話', '同じ秒の後の話']);
})->group('AC-F4-4');

it('puts the later created work first when the latest publications share a second', function (): void {
    $first = Work::factory()->create();
    $second = Work::factory()->create();
    $at = Carbon::parse('2026-11-27 12:00:00');
    Episode::factory()->for($second)->published()->create(['published_at' => $at]);
    Episode::factory()->for($first)->published()->create(['published_at' => $at]);

    expect($this->getJson('/api/new-arrivals')->json('data.*.id'))->toBe([$second->id, $first->id]);
})->group('AC-F7-1');

it('leaves out works without a published episode', function (): void {
    $published = Work::factory()->create();
    Episode::factory()->for($published)->published()->create();
    $draftOnly = Work::factory()->create();
    Episode::factory()->for($draftOnly)->create();
    Work::factory()->create();

    expect($this->getJson('/api/new-arrivals')->json('data.*.id'))->toBe([$published->id]);
})->group('AC-F3-5');

it('shows 30 works per page and links the next page', function (): void {
    $works = Work::factory()->count(31)->create();
    foreach ($works as $index => $work) {
        Episode::factory()->for($work)->published()->create(['published_at' => Carbon::parse('2026-11-01')->addMinutes($index)]);
    }

    $first = $this->getJson('/api/new-arrivals')->assertOk();
    expect($first->json('data'))->toHaveCount(30)
        ->and($first->json('data.0.id'))->toBe($works[30]->id)
        ->and($first->json('meta.current_page'))->toBe(1)
        ->and($first->json('links.next'))->not->toBeNull();

    $second = $this->getJson('/api/new-arrivals?page=2')->assertOk();
    expect($second->json('data.*.id'))->toBe([$works[0]->id])
        ->and($second->json('meta.current_page'))->toBe(2)
        ->and($second->json('links.next'))->toBeNull();
})->group('AC-F7-1');
