<?php

declare(strict_types=1);

namespace App\Enums;

enum SerialStatus: string
{
    case Running = 'running';
    case Completed = 'completed';
}
