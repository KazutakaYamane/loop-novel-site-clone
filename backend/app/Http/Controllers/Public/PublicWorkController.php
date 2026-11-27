<?php

declare(strict_types=1);

namespace App\Http\Controllers\Public;

use App\Http\Resources\PublicWorkResource;
use App\Models\Work;

final class PublicWorkController
{
    public function show(string $work): PublicWorkResource
    {
        $publishedWork = Work::query()
            ->published()
            ->with(['user', 'tags', 'publishedEpisodes:id,work_id,title'])
            ->findOrFail($work);

        return new PublicWorkResource($publishedWork);
    }
}
