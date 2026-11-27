<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\EpisodeStatus;
use Database\Factories\EpisodeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $work_id
 * @property string $title
 * @property string $body
 * @property EpisodeStatus $status
 * @property Carbon|null $published_at
 */
#[Fillable(['title', 'body'])]
class Episode extends Model
{
    /** @use HasFactory<EpisodeFactory> */
    use HasFactory;

    /** @var array<string, mixed> */
    protected $attributes = [
        'body' => '',
        'status' => 'draft',
    ];

    /**
     * @return BelongsTo<Work, $this>
     */
    public function work(): BelongsTo
    {
        return $this->belongsTo(Work::class);
    }

    public function isPublished(): bool
    {
        return $this->status === EpisodeStatus::Published;
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => EpisodeStatus::class,
            'published_at' => 'datetime',
        ];
    }
}
