<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Contracts\Session\Session;

// メールアドレスとパスワードでのログインの処理。利用者が直接呼べる経路は持たず、デモログインが内部で使う(AC-F2-2)
final readonly class LogInWithPassword
{
    public function __construct(
        private AuthFactory $auth,
        private Session $session,
        private PreviousLoginCookie $previousLoginCookie,
    ) {}

    public function handle(string $email, string $password): ?User
    {
        $guard = $this->auth->guard('web');
        if (! $guard instanceof StatefulGuard || ! $guard->attempt(['email' => $email, 'password' => $password])) {
            return null;
        }

        // セッション固定攻撃を防ぐため、ログインしたらセッション ID と CSRF トークンを作り直す
        $this->session->regenerate();
        $this->session->regenerateToken();

        $this->previousLoginCookie->remember();

        $user = $guard->user();

        return $user instanceof User ? $user : null;
    }
}
