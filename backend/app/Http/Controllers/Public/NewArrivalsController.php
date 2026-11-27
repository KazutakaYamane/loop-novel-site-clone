<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Resources\NewArrivalWorkResource;
use App\Models\Episode;
use App\Models\Work;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class NewArrivalsController
{
    // カクヨムの新着の 1 ページと同じ件数(docs/kakuyomu-reference/new-arrivals.md)
    private const PER_PAGE = 30;

    public function index(): AnonymousResourceCollection
    {
        $latestEpisode = Episode::query()
            ->select(['title', 'published_at'])
            ->whereColumn('work_id', 'works.id')
            ->published()
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->limit(1);

        $works = Work::query()
            ->published()
            ->with('user')
            ->joinLateral($latestEpisode, 'latest_episode')
            ->select(['works.*', 'latest_episode.title as latest_episode_title'])
            ->orderByDesc('latest_episode.published_at')
            // 公開時刻は秒までなので、同じ秒に並んだときは後に作った作品を前にする(ADR 0028)
            ->orderByDesc('works.id')
            ->simplePaginate(self::PER_PAGE);

        return NewArrivalWorkResource::collection($works);
    }
}
