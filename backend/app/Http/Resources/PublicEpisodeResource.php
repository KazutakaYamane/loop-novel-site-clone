<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Episode;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class PublicEpisodeResource extends JsonResource
{
    public function __construct(
        private readonly Episode $episode,
        private readonly ?int $previousId,
        private readonly ?int $nextId,
    ) {
        parent::__construct($episode);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $work = $this->episode->work;

        return [
            'id' => $this->episode->id,
            'title' => $this->episode->title,
            'body' => $this->episode->body,
            'work' => ['id' => $work->id, 'title' => $work->title, 'introduction' => $work->introduction],
            'previous_id' => $this->previousId,
            'next_id' => $this->nextId,
        ];
    }
}
