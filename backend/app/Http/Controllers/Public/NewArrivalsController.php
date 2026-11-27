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
        $works = Work::query()
            ->published()
            ->with('user')
            ->addSelect(['last_published_at' => Episode::query()
                ->selectRaw('max(published_at)')
                ->whereColumn('work_id', 'works.id')
                ->published()])
            ->orderByDesc('last_published_at')
            // 公開時刻は秒までなので、同じ秒に並んだときは後に作った作品を前にする(docs/adr/0026)
            ->orderByDesc('id')
            ->simplePaginate(self::PER_PAGE);

        return NewArrivalWorkResource::collection($works);
    }
}
