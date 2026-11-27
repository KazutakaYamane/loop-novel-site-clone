<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Episode;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

// 話の一覧の 1 行。本文は 10 万文字まであるので一覧には入れない
/**
 * @mixin Episode
 */
final class EpisodeSummaryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'status' => $this->status->value,
            'published_at' => $this->published_at?->toIso8601String(),
        ];
    }
}
