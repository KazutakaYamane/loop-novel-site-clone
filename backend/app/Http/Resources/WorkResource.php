<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Work;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Work
 */
final class WorkResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'catchphrase' => $this->catchphrase,
            'introduction' => $this->introduction,
            'genre' => $this->genre?->value,
            'tags' => $this->tags->pluck('name')->all(),
            'rating_cruel' => $this->rating_cruel,
            'rating_violent' => $this->rating_violent,
            'rating_sexual' => $this->rating_sexual,
            'serial_status' => $this->serial_status->value,
        ];
    }
}
