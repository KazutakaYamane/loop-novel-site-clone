<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

// 話の作成・編集の送信回数の制限(AC-F4-9)。値はテストの環境でも本番と同じにするため、環境変数では変えない(docs/adr/0023)
class EpisodeRateLimitServiceProvider extends ServiceProvider
{
    public const string LIMITER = 'episode-submission';

    private const int MAX_SUBMISSIONS = 30;

    private const int DECAY_MINUTES = 10;

    public function boot(): void
    {
        // auth の後に通すので利用者は必ずいる。利用者ごとに数え、送信元の IP は使わない
        RateLimiter::for(self::LIMITER, fn () => Limit::perMinutes(self::DECAY_MINUTES, self::MAX_SUBMISSIONS)
            ->by(Auth::id()));
    }
}
