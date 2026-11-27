<?php

declare(strict_types=1);

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

// 公開後の編集は作らない(要件書 7 章)。公開済みの話を保存・公開し直そうとしたときに投げる
final class EpisodeAlreadyPublished extends RuntimeException
{
    public function render(): JsonResponse
    {
        return new JsonResponse(['message' => '公開済みのエピソードは編集できません。'], 409);
    }
}
