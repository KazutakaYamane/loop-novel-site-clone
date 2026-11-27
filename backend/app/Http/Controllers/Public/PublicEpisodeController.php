<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Resources\PublicEpisodeResource;
use App\Models\Episode;

final class PublicEpisodeController
{
    public function show(string $work, string $episode): PublicEpisodeResource
    {
        $publishedEpisode = Episode::query()
            ->published()
            ->where('work_id', $work)
            ->with('work')
            ->findOrFail($episode);
        $siblings = $publishedEpisode->work->publishedEpisodes();

        $previous = (clone $siblings)->where('id', '<', $publishedEpisode->id)->reorder('id', 'desc')->first(['id']);
        $next = $siblings->where('id', '>', $publishedEpisode->id)->first(['id']);

        return new PublicEpisodeResource($publishedEpisode, $previous?->id, $next?->id);
    }
}
