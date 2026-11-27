<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Episode;
use App\Models\Work;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Work */
final class PublicWorkResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            ...WorkResource::make($this->resource)->toArray($request),
            'genre_label' => $this->genre?->label(),
            'author_name' => $this->user->name,
            'episodes' => $this->publishedEpisodes->map(fn (Episode $episode): array => [
                'id' => $episode->id,
                'title' => $episode->title,
            ])->all(),
        ];
    }
}
