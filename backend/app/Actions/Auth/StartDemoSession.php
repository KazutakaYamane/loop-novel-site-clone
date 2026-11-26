<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Enums\DemoRole;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

// デモのボタンの処理。通常の会員登録とログインを、予約ドメインのアドレスと利用者に見せないパスワードで呼ぶ(AC-F2-2、AC-F2-8)
final readonly class StartDemoSession
{
    public function __construct(
        private RegisterUser $registerUser,
        private LogInWithPassword $logIn,
    ) {}

    public function handle(DemoRole $role): User
    {
        // RFC 2606 の予約ドメインなので、実在のアドレスと衝突せず、メールも届かない
        $email = 'demo-'.Str::uuid()->toString().'@example.com';
        // パスワードはこの変数の中にだけ置き、DB にはハッシュだけが残る
        $password = Str::random(64);

        DB::transaction(fn () => $this->registerUser->handle($role->userName(), $email, $password));

        return $this->logIn->handle($email, $password)
            ?? throw new RuntimeException('The demo user could not log in.');
    }
}
