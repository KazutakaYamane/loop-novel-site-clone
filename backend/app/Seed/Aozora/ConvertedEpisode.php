<?php

declare(strict_types=1);

namespace App\Seed\Aozora;

final readonly class ConvertedEpisode
{
    public function __construct(
        public string $title,
        public string $body,
    ) {}
}
