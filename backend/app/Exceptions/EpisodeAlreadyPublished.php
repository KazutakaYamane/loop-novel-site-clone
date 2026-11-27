<?php

declare(strict_types=1);

namespace App\Exceptions;

use Symfony\Component\HttpKernel\Exception\HttpException;

// 公開後の編集は作らない(要件書 7 章)。公開済みの話を保存・公開し直そうとしたときに 409 で拒む。
// 利用者の操作で起きる拒否なので、HTTP の例外としてエラーのログに残さない
final class EpisodeAlreadyPublished extends HttpException
{
    public function __construct()
    {
        parent::__construct(409, '公開済みのエピソードは編集できません。');
    }
}
