<?php

declare(strict_types=1);

namespace App\Actions\Episodes;

use App\Enums\EpisodeStatus;
use App\Exceptions\EpisodeAlreadyPublished;
use App\Models\Episode;
use Illuminate\Support\Facades\DB;

// 下書きを、フォームの内容で保存して公開する。本文が空でないことは呼ぶ側(PublishEpisodeRequest)が確かめる
final class PublishEpisode
{
    public function handle(Episode $episode, string $title, string $body): Episode
    {
        return DB::transaction(function () use ($episode, $title, $body) {
            // 公開が重なっても公開時刻が 1 回だけ決まるよう、行を固定して状態を確かめる
            $locked = Episode::query()->whereKey($episode->id)->lockForUpdate()->sole();
            if ($locked->isPublished()) {
                throw new EpisodeAlreadyPublished;
            }
            $locked->fill(['title' => $title, 'body' => $body]);
            $locked->status = EpisodeStatus::Published;
            $locked->published_at = now();
            $locked->save();

            return $locked;
        });
    }
}
