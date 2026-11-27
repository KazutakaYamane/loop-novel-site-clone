<?php

declare(strict_types=1);

namespace App\Http\Controllers\My;

use App\Actions\Episodes\SaveDraftEpisode;
use App\Http\Controllers\Controller;
use App\Http\Requests\My\SaveEpisodeRequest;
use App\Http\Resources\EpisodeResource;
use App\Http\Resources\EpisodeSummaryResource;
use App\Models\Episode;
use App\Models\Work;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

// 話の持ち主は作品の持ち主で、WorkPolicy が確かめる(docs/adr/0020)。
// 話は経路の作品に属するものだけを探す(scoped)ので、他の作品の話は 404 になる
final class EpisodeController extends Controller
{
    public function index(Work $work): AnonymousResourceCollection
    {
        Gate::authorize('update', $work);

        return EpisodeSummaryResource::collection($work->episodes()->get());
    }

    public function store(SaveEpisodeRequest $request, Work $work): JsonResponse
    {
        Gate::authorize('update', $work);

        $episode = $work->episodes()->create(['title' => $request->title(), 'body' => $request->body()]);

        return new JsonResponse((new EpisodeResource($episode->refresh()))->resolve($request), 201);
    }

    public function show(Request $request, Work $work, Episode $episode): JsonResponse
    {
        Gate::authorize('update', $work);

        return new JsonResponse((new EpisodeResource($episode))->resolve($request));
    }

    public function update(SaveEpisodeRequest $request, Work $work, Episode $episode, SaveDraftEpisode $saveDraft): JsonResponse
    {
        Gate::authorize('update', $work);

        $saved = $saveDraft->handle($episode, $request->title(), $request->body());

        return new JsonResponse((new EpisodeResource($saved))->resolve($request));
    }
}
