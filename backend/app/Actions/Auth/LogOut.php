<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use Illuminate\Contracts\Session\Session;

final readonly class LogOut
{
    public function __construct(
        private Session $session,
    ) {}

    public function handle(): void
    {
        // ログイン中の利用者はセッションにだけ残っている(docs/adr/0015)。セッションごと捨てて ID を作り直せば、
        // 前の cookie では同じユーザーに戻れない(AC-F2-4)。CSRF トークンも消え、次のリクエストで作り直される
        $this->session->invalidate();
    }
}
