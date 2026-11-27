<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;

// 会員登録の処理。利用者が直接呼べる経路は持たず、デモログインが内部で使う(AC-F2-2)
final class RegisterUser
{
    public function handle(string $name, string $email, string $password): User
    {
        // パスワードは User の hashed キャストでハッシュにしてから保存される
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => $password,
        ]);
    }
}
