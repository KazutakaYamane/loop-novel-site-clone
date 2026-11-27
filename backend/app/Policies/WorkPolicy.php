<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use App\Models\Work;

// 作品の設定を開く・変えるのは所有者だけ(AC-F3-4、docs/adr/0020)
final class WorkPolicy
{
    public function update(User $user, Work $work): bool
    {
        return $user->id === $work->user_id;
    }
}
