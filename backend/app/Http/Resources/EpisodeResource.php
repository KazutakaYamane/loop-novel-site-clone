<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Episode;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Episode
 */
final class EpisodeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'work_id' => $this->work_id,
            'title' => $this->title,
            'body' => $this->body,
            'status' => $this->status->value,
            'published_at' => $this->published_at?->toIso8601String(),
        ];
    }
}
