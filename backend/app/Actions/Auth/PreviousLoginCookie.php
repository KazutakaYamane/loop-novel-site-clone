<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use Illuminate\Support\Facades\Cookie;

final class PreviousLoginCookie
{
    public const string NAME = 'yomikaki_previous_login';

    public const string VALUE = '1';

    public function remember(): void
    {
        Cookie::queue(Cookie::make(
            self::NAME,
            self::VALUE,
            config()->integer('session.lifetime') + 24 * 60,
            sameSite: 'lax',
        ));
    }

    public function forget(): void
    {
        Cookie::queue(Cookie::forget(self::NAME));
    }
}
