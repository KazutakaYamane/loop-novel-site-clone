<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // $request->ip() は nginx が REMOTE_ADDR に入れた利用者の IP。X-Forwarded-For は信頼しない(docs/adr/0017)
        RateLimiter::for('demo-login', fn (Request $request) => Limit::perHour(config()->integer('rate-limits.demo_login_per_hour'))
            ->by((string) $request->ip()));
    }
}
