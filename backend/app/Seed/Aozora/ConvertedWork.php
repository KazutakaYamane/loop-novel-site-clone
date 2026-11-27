<?php

declare(strict_types=1);

namespace App\Seed\Aozora;

final readonly class ConvertedWork
{
    /** @param list<ConvertedEpisode> $episodes */
    public function __construct(
        public string $title,
        public string $author,
        public array $episodes,
        public string $credit,
    ) {}
}
