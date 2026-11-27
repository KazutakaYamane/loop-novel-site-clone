<?php

declare(strict_types=1);

namespace App\Enums;

enum DemoRole: string
{
    case Author = 'author';
    case Reader = 'reader';

    public function userName(): string
    {
        return match ($this) {
            self::Author => 'デモ作者',
            self::Reader => 'デモ読者',
        };
    }
}
