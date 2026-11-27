<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Work;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Work
 *
 * @property-read string $latest_episode_title
 */
final class NewArrivalWorkResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'catchphrase' => $this->catchphrase,
            'introduction' => $this->introduction,
            'author_name' => $this->user->name,
            'latest_episode_title' => $this->latest_episode_title,
        ];
    }
}
