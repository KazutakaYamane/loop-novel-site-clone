<?php

namespace Database\Factories;

use App\Enums\EpisodeStatus;
use App\Models\Episode;
use App\Models\Work;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Episode>
 */
class EpisodeFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'work_id' => Work::factory(),
            'title' => fake()->sentence(3),
            'body' => fake()->paragraph(),
            'status' => EpisodeStatus::Draft,
            'published_at' => null,
        ];
    }

    public function published(): static
    {
        return $this->state(fn () => [
            'status' => EpisodeStatus::Published,
            'published_at' => now(),
        ]);
    }
}
