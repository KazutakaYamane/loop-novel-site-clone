<?php

declare(strict_types=1);

use App\Enums\EpisodeStatus;
use App\Models\Episode;
use App\Models\Tag;
use App\Models\User;
use App\Models\Work;
use App\Seed\Aozora\SeedAozoraWorks;
use App\Seed\Aozora\SeedDirectory;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;

/** @return list<array<string, mixed>> */
function seedManifest(): array
{
    return json_decode(File::get(database_path('data/aozora/manifest.json')), true);
}

/** @return array{title: string, author: string, episodes: list<array{title: string, body: string}>, credit: string} */
function seedWorkData(string $slug): array
{
    return json_decode(File::get(database_path("data/aozora/works/{$slug}.json")), true);
}

// 2 つの文字列が共有する、最も長い部分文字列の長さ(コードポイント単位)
function longestCommonSubstring(string $a, string $b): int
{
    $a = mb_str_split($a);
    $longest = 0;
    for ($start = 0; $start < count($a); $start++) {
        for ($length = $longest + 1; $start + $length <= count($a); $length++) {
            if (! str_contains($b, implode('', array_slice($a, $start, $length)))) {
                break;
            }
            $longest = $length;
        }
    }

    return $longest;
}

beforeEach(function () {
    // シードの投入はネットワークを使わない。外へのリクエストがあればテストが落ちる
    Http::preventStrayRequests();
});

test('the seed puts in 10 to 20 aozora works across several genres, each written by a seed user', function () {
    $this->seed();

    $works = Work::query()->with('user')->get();
    expect($works->count())->toBe(count(seedManifest()))->toBeGreaterThanOrEqual(10)->toBeLessThanOrEqual(20)
        ->and($works->pluck('genre')->unique()->count())->toBeGreaterThanOrEqual(5);
    foreach (seedManifest() as $entry) {
        $data = seedWorkData($entry['slug']);
        $work = $works->firstWhere('title', $data['title']);
        expect($work)->not->toBeNull()
            ->and($work->user->name)->toBe($data['author'])
            ->and($work->user->email)->toBe("seed-{$entry['author_key']}@example.com")
            ->and($work->genre?->value)->toBe($entry['genre'])
            ->and($work->tags()->pluck('name')->all())->toBe($entry['tags'])
            ->and($work->serial_status->value)->toBe('completed')
            ->and($work->episodes()->pluck('title')->all())->toBe(array_column($data['episodes'], 'title'));
    }
    // 同じ作者の作品は 1 人のユーザーが持つ
    expect(User::query()->count())->toBe(count(array_unique(array_column(seedManifest(), 'author_key'))));
})->group('AC-F8-1');

test('each work shows its aozora credit on the work page and at the end of its last episode', function () {
    $this->seed();

    foreach (seedManifest() as $entry) {
        $data = seedWorkData($entry['slug']);
        $work = Work::query()->where('title', $data['title'])->sole();
        $last = $work->episodes()->get()->last();
        expect($data['credit'])->toStartWith('底本：')->toContain('入力：')->toContain('青空文庫')
            ->and($work->introduction)->toStartWith($entry['introduction']."\n\n出典：青空文庫（https://www.aozora.gr.jp/）\n底本：")
            ->toContain("\n入力：")
            ->and($last->body)->toEndWith("\n\n\n".$data['credit']);
    }
})->group('AC-F8-2');

test('the seeded texts keep aozora ruby as F5 notation and contain no aozora annotations', function () {
    $this->seed();

    $kumo = Work::query()->where('title', '蜘蛛の糸')->sole();
    expect($kumo->episodes()->first()->body)->toContain('御釈迦様《おしゃかさま》');
    foreach (Episode::query()->get() as $episode) {
        expect($episode->body)->not->toContain('［＃')->not->toContain('※［')
            ->and($episode->title)->not->toContain('［＃');
    }
})->group('AC-F8-3');

// AC-F8-4 は文章を新たに書いたことを求める。機械で確かめられるのは、取得したテキストから写していないことなので、
// 取得したままの本文と、キャッチコピー・あらすじが 12 文字以上続けて一致しないことを見る
test('the catchphrase and synopsis of each work are not copied from the fetched aozora text', function () {
    foreach (seedManifest() as $entry) {
        $source = File::get(database_path("data/aozora/source/{$entry['slug']}.txt"));
        expect($entry['catchphrase'])->not->toBe('')
            ->and(mb_strlen($entry['catchphrase']))->toBeLessThanOrEqual(35)
            ->and(mb_strlen($entry['introduction']))->toBeGreaterThan(80)
            ->and(longestCommonSubstring($entry['catchphrase'], $source))->toBeLessThan(12)
            ->and(longestCommonSubstring($entry['introduction'], $source))->toBeLessThan(12);
    }

    $this->seed();
    $work = Work::query()->where('title', seedWorkData(seedManifest()[0]['slug'])['title'])->sole();
    expect($work->catchphrase)->toBe(seedManifest()[0]['catchphrase']);
})->group('AC-F8-4');

test('seeding needs only the files in the repository', function () {
    $directory = database_path('data/aozora');
    foreach (seedManifest() as $entry) {
        expect(File::exists("{$directory}/works/{$entry['slug']}.json"))->toBeTrue()
            ->and(File::exists("{$directory}/source/{$entry['slug']}.txt"))->toBeTrue();
    }

    $this->artisan('db:seed', ['--force' => true])->assertSuccessful();

    Http::assertNothingSent();
    expect(Work::query()->count())->toBe(count(seedManifest()));
})->group('AC-F8-5');

test('the seed works appear in the new arrivals in the order of their publication times', function () {
    $this->seed();

    $titles = collect($this->getJson('/api/new-arrivals')->assertOk()->json('data'))->pluck('title')->all();

    $expected = collect(seedManifest())
        ->sortByDesc(fn (array $entry) => strtotime($entry['published_at']))
        ->map(fn (array $entry) => seedWorkData($entry['slug'])['title'])
        ->values()->all();
    expect($titles)->toBe($expected);
    foreach (seedManifest() as $entry) {
        $work = Work::query()->where('title', seedWorkData($entry['slug'])['title'])->sole();
        $episodes = $work->episodes()->get();
        expect($episodes->every(fn (Episode $episode) => $episode->status === EpisodeStatus::Published))->toBeTrue()
            ->and($episodes->last()->published_at?->getTimestamp())->toBe(strtotime($entry['published_at']))
            ->and($episodes->pluck('published_at')->map->getTimestamp()->all())
            ->toBe($episodes->pluck('published_at')->map->getTimestamp()->sort()->values()->all());
    }
})->group('AC-F8-6');

test('seeding again leaves the same users, works, episodes and tags without duplicates', function () {
    $this->seed();
    $before = [
        User::query()->orderBy('id')->get(['id', 'name', 'email'])->toArray(),
        Work::query()->orderBy('id')->get(['id', 'title', 'catchphrase', 'introduction'])->toArray(),
        Episode::query()->orderBy('id')->get(['id', 'work_id', 'title', 'body', 'published_at'])->toArray(),
        Tag::query()->orderBy('id')->get(['work_id', 'position', 'name'])->toArray(),
    ];

    $this->seed();

    expect([
        User::query()->orderBy('id')->get(['id', 'name', 'email'])->toArray(),
        Work::query()->orderBy('id')->get(['id', 'title', 'catchphrase', 'introduction'])->toArray(),
        Episode::query()->orderBy('id')->get(['id', 'work_id', 'title', 'body', 'published_at'])->toArray(),
        Tag::query()->orderBy('id')->get(['work_id', 'position', 'name'])->toArray(),
    ])->toBe($before);
})->group('AC-F8-1');

test('seeding over changed data updates the work in place and drops episodes the data no longer has', function () {
    $dir = sys_get_temp_dir().'/seed-'.bin2hex(random_bytes(6));
    $write = function (array $episodes, string $catchphrase, array $tags) use ($dir) {
        File::ensureDirectoryExists($dir.'/works');
        File::put($dir.'/manifest.json', json_encode([[
            'slug' => 'kumo', 'author_key' => 'akutagawa', 'genre' => 'others', 'catchphrase' => $catchphrase,
            'introduction' => 'あらすじ', 'tags' => $tags, 'published_at' => '2026-11-20T09:00:00+09:00',
        ]]));
        File::put($dir.'/works/kumo.json', json_encode([
            'title' => '蜘蛛の糸', 'author' => '芥川竜之介', 'episodes' => $episodes, 'credit' => "底本：本\n入力：誰か\n校正：別の誰か\n青空文庫作成ファイル：",
        ]));
    };
    $seed = fn () => app(SeedAozoraWorks::class)->handle(new SeedDirectory($dir));
    $other = User::factory()->create(['name' => '他の作者']);
    $othersWork = Work::factory()->for($other)->create(['title' => '蜘蛛の糸']);

    $write([['title' => '一', 'body' => '一の本文'], ['title' => '二', 'body' => '二の本文']], '古いコピー', ['a', 'b']);
    $seed();
    $work = Work::query()->whereNot('id', $othersWork->id)->sole();
    $firstEpisode = $work->episodes()->first();
    expect($work->episodes()->get()->map(fn (Episode $e) => $e->published_at?->getTimestamp())->all())
        ->toBe([strtotime('2026-11-20T08:59:00+09:00'), strtotime('2026-11-20T09:00:00+09:00')]);

    $write([['title' => '一（改）', 'body' => '新しい本文']], '新しいコピー', ['c']);
    $seed();

    $work->refresh();
    expect(Work::query()->count())->toBe(2)
        ->and($work->catchphrase)->toBe('新しいコピー')
        ->and($work->introduction)->toBe("あらすじ\n\n出典：青空文庫（https://www.aozora.gr.jp/）\n底本：本\n入力：誰か\n校正：別の誰か")
        ->and($work->tags()->pluck('name')->all())->toBe(['c'])
        ->and($work->episodes()->get()->map(fn (Episode $e) => [$e->id, $e->title, $e->body])->all())
        ->toBe([[$firstEpisode->id, '一（改）', "新しい本文\n\n\n底本：本\n入力：誰か\n校正：別の誰か\n青空文庫作成ファイル："]])
        ->and($othersWork->fresh()->user_id)->toBe($other->id);
    File::deleteDirectory($dir);
})->group('AC-F8-1');
