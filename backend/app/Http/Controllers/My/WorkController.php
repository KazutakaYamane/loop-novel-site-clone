<?php

declare(strict_types=1);

namespace App\Http\Controllers\My;

use App\Http\Controllers\Controller;
use App\Http\Requests\My\StoreWorkRequest;
use App\Http\Requests\My\UpdateWorkRequest;
use App\Http\Resources\WorkResource;
use App\Models\User;
use App\Models\Work;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

// ログインした利用者のワークスペースの作品。他の利用者の作品は WorkPolicy が拒む(docs/adr/0020)
final class WorkController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();
        $works = Work::query()
            ->whereBelongsTo($user)
            ->with('tags')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get();

        return WorkResource::collection($works);
    }

    public function store(StoreWorkRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $work = new Work($request->validated());
        $work->user()->associate($user);
        $work->save();

        return new JsonResponse((new WorkResource($work->load('tags')))->resolve($request), 201);
    }

    public function show(Request $request, Work $work): JsonResponse
    {
        Gate::authorize('update', $work);

        return new JsonResponse((new WorkResource($work->load('tags')))->resolve($request));
    }

    public function update(UpdateWorkRequest $request, Work $work): JsonResponse
    {
        Gate::authorize('update', $work);

        // 同じ作品への保存が重なっても、タグの並びが混ざったり一意の制約で落ちたりしないよう、作品の行を固定して置き換える
        $saved = DB::transaction(function () use ($request, $work) {
            $locked = Work::query()->whereKey($work->id)->lockForUpdate()->sole();
            $locked->update($request->settings());
            $locked->tags()->delete();
            foreach ($request->tagNames() as $position => $name) {
                $locked->tags()->create(['position' => $position, 'name' => $name]);
            }

            return $locked;
        });

        return new JsonResponse((new WorkResource($saved->load('tags')))->resolve($request));
    }
}
