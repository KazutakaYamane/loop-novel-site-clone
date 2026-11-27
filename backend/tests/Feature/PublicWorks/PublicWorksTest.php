<?php

declare(strict_types=1);

use App\Models\Episode;
use App\Models\User;
use App\Models\Work;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('returns work details and published episode summaries in creation order', function (): void {
    $author = User::factory()->create(['name' => '灯台の作者']);
    $work = Work::factory()->for($author)->create([
        'title' => '海の手帖',
        'catchphrase' => '遠い岸から',
        'introduction' => '岬の日誌',
        'genre' => 'sf',
        'rating_cruel' => true,
        'rating_sexual' => true,
        'serial_status' => 'completed',
    ]);
    $work->tags()->create(['name' => '海', 'position' => 0]);
    $first = Episode::factory()->for($work)->published()->create([
        'title' => '第一章',
        'published_at' => now(),
    ]);
    Episode::factory()->for($work)->create(['title' => '非公開']);
    $last = Episode::factory()->for($work)->published()->create([
        'title' => '第三章',
        'published_at' => now()->subDay(),
    ]);

    $this->getJson("/api/works/{$work->id}")->assertOk()->assertExactJson(['data' => [
        'id' => $work->id,
        'title' => '海の手帖',
        'catchphrase' => '遠い岸から',
        'introduction' => '岬の日誌',
        'genre' => 'sf',
        'genre_label' => 'SF',
        'tags' => ['海'],
        'rating_cruel' => true,
        'rating_violent' => false,
        'rating_sexual' => true,
        'serial_status' => 'completed',
        'author_name' => '灯台の作者',
        'episodes' => [
            ['id' => $first->id, 'title' => '第一章'],
            ['id' => $last->id, 'title' => '第三章'],
        ],
    ]]);
});

it('finds adjacent published episodes of the same work and preserves the body', function (): void {
    $work = Work::factory()->create(['title' => '海の手帖', 'introduction' => '岬の日誌']);
    $first = Episode::factory()->for($work)->published()->create(['title' => '第一章']);
    Episode::factory()->published()->create();
    Episode::factory()->for($work)->create();
    $body = "　段落の始まり。\n\n<b>文字として読む</b>\n";
    $middle = Episode::factory()->for($work)->published()->create(['title' => '第二章', 'body' => $body]);
    Episode::factory()->published()->create();
    Episode::factory()->for($work)->create();
    $last = Episode::factory()->for($work)->published()->create(['title' => '第三章']);

    $this->getJson("/api/works/{$work->id}/episodes/{$middle->id}")->assertOk()->assertExactJson(['data' => [
        'id' => $middle->id,
        'title' => '第二章',
        'body' => $body,
        'work' => ['id' => $work->id, 'title' => '海の手帖', 'introduction' => '岬の日誌'],
        'previous_id' => $first->id,
        'next_id' => $last->id,
    ]]);
    $this->getJson("/api/works/{$work->id}/episodes/{$first->id}")->assertOk()->assertJsonPath('data.previous_id', null);
    $this->getJson("/api/works/{$work->id}/episodes/{$last->id}")->assertOk()->assertJsonPath('data.next_id', null);
});

it('hides unpublished works and drafts including from their owner', function (): void {
    $owner = User::factory()->create();
    $work = Work::factory()->for($owner)->create();
    $unpublished = Work::factory()->for($owner)->create();
    $draft = Episode::factory()->for($work)->create();
    $published = Episode::factory()->for($work)->published()->create();
    Episode::factory()->for($unpublished)->create();
    $otherWork = Episode::factory()->published()->create()->work;

    $paths = [
        "/api/works/{$unpublished->id}",
        "/api/works/{$work->id}/episodes/{$draft->id}",
        "/api/works/{$otherWork->id}/episodes/{$published->id}",
        '/api/works/missing',
        "/api/works/{$work->id}/episodes/missing",
        "/api/works/{$work->id}suffix",
        "/api/works/{$work->id}/episodes/{$published->id}suffix",
    ];
    foreach ($paths as $path) {
        $this->getJson($path)->assertNotFound();
    }
    $this->actingAs($owner);
    foreach ($paths as $path) {
        $this->getJson($path)->assertNotFound();
    }
});
