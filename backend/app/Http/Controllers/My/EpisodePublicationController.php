<?php

declare(strict_types=1);

namespace App\Http\Controllers\My;

use App\Actions\Episodes\PublishEpisode;
use App\Http\Controllers\Controller;
use App\Http\Requests\My\PublishEpisodeRequest;
use App\Http\Resources\EpisodeResource;
use App\Models\Episode;
use App\Models\Work;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

final class EpisodePublicationController extends Controller
{
    public function store(PublishEpisodeRequest $request, Work $work, Episode $episode, PublishEpisode $publish): JsonResponse
    {
        Gate::authorize('update', $work);

        $published = $publish->handle($episode, $request->title(), $request->body());

        return new JsonResponse((new EpisodeResource($published))->resolve($request));
    }
}
