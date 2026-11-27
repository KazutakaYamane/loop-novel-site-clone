<?php

declare(strict_types=1);

use App\Actions\Auth\LogInWithPassword;
use App\Actions\Auth\StartDemoSession;

// ログインできるのは、毎回新しいユーザーを作るデモログインの中だけにする。
// 他の経路からパスワードでログインできると、既存のユーザーに戻れてしまう(AC-F2-4、docs/adr/0015)
arch('only the demo login logs a user in with a password')
    ->expect(LogInWithPassword::class)
    ->toOnlyBeUsedIn(StartDemoSession::class)
    ->group('AC-F2-4');
