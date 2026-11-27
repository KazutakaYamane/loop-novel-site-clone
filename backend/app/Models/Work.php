<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Genre;
use App\Enums\SerialStatus;
use Database\Factories\WorkFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $user_id
 * @property string $title
 * @property string|null $catchphrase
 * @property string|null $introduction
 * @property Genre|null $genre
 * @property bool $rating_cruel
 * @property bool $rating_violent
 * @property bool $rating_sexual
 * @property SerialStatus $serial_status
 */
#[Fillable(['title', 'catchphrase', 'introduction', 'genre', 'rating_cruel', 'rating_violent', 'rating_sexual', 'serial_status'])]
class Work extends Model
{
    /** @use HasFactory<WorkFactory> */
    use HasFactory;

    /** @var array<string, mixed> */
    protected $attributes = [
        'rating_cruel' => false,
        'rating_violent' => false,
        'rating_sexual' => false,
        'serial_status' => 'running',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * 作品の中の並びは作った順(AC-F4-8)
     *
     * @return HasMany<Episode, $this>
     */
    public function episodes(): HasMany
    {
        return $this->hasMany(Episode::class)->orderBy('id');
    }

    /**
     * @return HasMany<Tag, $this>
     */
    public function tags(): HasMany
    {
        return $this->hasMany(Tag::class)->orderBy('position');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'genre' => Genre::class,
            'rating_cruel' => 'boolean',
            'rating_violent' => 'boolean',
            'rating_sexual' => 'boolean',
            'serial_status' => SerialStatus::class,
        ];
    }
}
