<?php

declare(strict_types=1);

namespace App\Seed\Aozora;

use App\Enums\EpisodeStatus;
use App\Enums\Genre;
use App\Enums\SerialStatus;
use App\Models\Episode;
use App\Models\User;
use App\Models\Work;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use UnexpectedValueException;

// リポジトリの中のシードのデータ(SeedDirectory)だけから、青空文庫の作品と作者のユーザーを入れる(AC-F8-1、AC-F8-5)。
// 何度実行しても同じ状態になるよう、作者はメールアドレス、作品は作者とタイトルで探して上書きし、話は作った順に上書きする
final readonly class SeedAozoraWorks
{
    private const string SOURCE_NOTE = '出典：青空文庫（https://www.aozora.gr.jp/）';

    /** @return list<Work> */
    public function handle(SeedDirectory $directory): array
    {
        return DB::transaction(fn () => array_map(
            fn (array $entry) => $this->seedWork($entry, $this->workData($directory, SeedDirectory::string($entry, 'slug'))),
            $directory->entries(),
        ));
    }

    /**
     * @param  array<array-key, mixed>  $entry
     * @param  array<array-key, mixed>  $data
     */
    private function seedWork(array $entry, array $data): Work
    {
        $author = $this->author(SeedDirectory::string($entry, 'author_key'), SeedDirectory::string($data, 'author'));
        $title = SeedDirectory::string($data, 'title');
        $credit = SeedDirectory::string($data, 'credit');
        $work = Work::query()->whereBelongsTo($author)->where('title', $title)->first() ?? new Work(['title' => $title]);
        $work->user()->associate($author);
        $work->fill([
            'catchphrase' => SeedDirectory::string($entry, 'catchphrase'),
            'introduction' => SeedDirectory::string($entry, 'introduction')."\n\n".$this->shortCredit($credit),
            'genre' => Genre::from(SeedDirectory::string($entry, 'genre')),
            'serial_status' => SerialStatus::Completed,
            'rating_cruel' => false,
            'rating_violent' => false,
            'rating_sexual' => false,
        ]);
        $work->save();

        $work->tags()->delete();
        foreach ($this->strings($entry, 'tags') as $position => $name) {
            $work->tags()->create(['position' => $position, 'name' => $name]);
        }

        // timestamp の列は時差を持たないので、アプリの時間帯に直してから入れる
        $this->seedEpisodes($work, $this->episodes($data), $credit, Carbon::parse(SeedDirectory::string($entry, 'published_at'))->setTimezone(now()->getTimezone()));

        return $work;
    }

    private function author(string $key, string $name): User
    {
        $author = User::query()->firstOrNew(['email' => "seed-{$key}@example.com"]);
        $author->name = $name;
        // シードの作者でログインする方法は作らない(#130 の範囲外)ので、パスワードは誰にも知らせない
        $author->password ??= Str::random(64);
        $author->save();

        return $author;
    }

    // 作品ページで読めるよう、紹介文の後ろに底本・入力・校正を添える。全文は最後の話の末尾に置く(AC-F8-2)
    private function shortCredit(string $credit): string
    {
        $lines = array_filter(explode("\n", $credit), fn (string $line) => preg_match('/^(底本|入力|校正)：/u', $line) === 1);

        return self::SOURCE_NOTE."\n".implode("\n", $lines);
    }

    /**
     * 最後の話の公開時刻を作品の公開時刻にし、それより前の話は 1 分ずつ前に公開したことにする(AC-F8-6)
     *
     * @param  list<array{title: string, body: string}>  $episodes
     */
    private function seedEpisodes(Work $work, array $episodes, string $credit, Carbon $publishedAt): void
    {
        $existing = $work->episodes()->get()->values();
        $last = count($episodes) - 1;
        foreach ($episodes as $index => $data) {
            $episode = $existing->get($index) ?? new Episode;
            $episode->work()->associate($work);
            $episode->fill([
                'title' => $data['title'],
                'body' => $index === $last ? $data['body']."\n\n\n".$credit : $data['body'],
            ]);
            $episode->status = EpisodeStatus::Published;
            $episode->published_at = $publishedAt->copy()->subMinutes($last - $index);
            $episode->save();
        }
        $existing->slice(count($episodes))->each(fn (Episode $episode) => $episode->delete());
    }

    /** @return array<array-key, mixed> */
    private function workData(SeedDirectory $directory, string $slug): array
    {
        $data = json_decode(File::get($directory->workPath($slug)), true, flags: JSON_THROW_ON_ERROR);

        return is_array($data) ? $data : throw new UnexpectedValueException($slug.' の作品のデータは object にする');
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return list<array{title: string, body: string}>
     */
    private function episodes(array $data): array
    {
        $episodes = $data['episodes'] ?? null;
        if (! is_array($episodes) || ! array_is_list($episodes) || $episodes === []) {
            throw new UnexpectedValueException('episodes は 1 つ以上の話の配列にする');
        }

        return array_map(fn (mixed $episode) => is_array($episode)
            ? ['title' => SeedDirectory::string($episode, 'title'), 'body' => SeedDirectory::string($episode, 'body')]
            : throw new UnexpectedValueException('話は object にする'), $episodes);
    }

    /**
     * @param  array<array-key, mixed>  $data
     * @return list<string>
     */
    private function strings(array $data, string $key): array
    {
        $values = $data[$key] ?? null;
        if (! is_array($values) || ! array_is_list($values)) {
            throw new UnexpectedValueException($key.' は文字列の配列にする');
        }

        return array_map(fn (mixed $value) => is_string($value) ? $value : throw new UnexpectedValueException($key.' は文字列の配列にする'), $values);
    }
}
