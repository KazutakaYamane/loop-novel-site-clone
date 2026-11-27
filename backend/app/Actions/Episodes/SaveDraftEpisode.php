<?php

declare(strict_types=1);

namespace App\Actions\Episodes;

use App\Exceptions\EpisodeAlreadyPublished;
use App\Models\Episode;
use Illuminate\Support\Facades\DB;

// 下書きの保存し直し。同じ話への公開と重なっても公開済みの話を書き換えないよう、行を固定して状態を確かめる
final class SaveDraftEpisode
{
    public function handle(Episode $episode, string $title, string $body): Episode
    {
        return DB::transaction(function () use ($episode, $title, $body) {
            $locked = Episode::query()->whereKey($episode->id)->lockForUpdate()->sole();
            if ($locked->isPublished()) {
                throw new EpisodeAlreadyPublished;
            }
            $locked->update(['title' => $title, 'body' => $body]);

            return $locked;
        });
    }
}
