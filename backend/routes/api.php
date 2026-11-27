<?php

declare(strict_types=1);

use App\Http\Controllers\Auth\CsrfTokenController;
use App\Http\Controllers\Auth\CurrentUserController;
use App\Http\Controllers\Auth\DemoSessionController;
use App\Http\Controllers\Auth\SessionController;
use App\Http\Controllers\GenreController;
use App\Http\Controllers\My\EpisodeController;
use App\Http\Controllers\My\EpisodePublicationController;
use App\Http\Controllers\My\WorkController;
use App\Providers\EpisodeRateLimitServiceProvider;
use Illuminate\Support\Facades\Route;

Route::get('/csrf-token', [CsrfTokenController::class, 'show']);
Route::post('/demo-sessions', [DemoSessionController::class, 'store'])->middleware('throttle:demo-login');
Route::get('/user', [CurrentUserController::class, 'show'])->middleware('auth');
Route::delete('/session', [SessionController::class, 'destroy']);
Route::get('/genres', [GenreController::class, 'index']);
Route::middleware('auth')->prefix('my')->group(function () {
    Route::apiResource('works', WorkController::class)->only(['index', 'store', 'show', 'update']);
    Route::apiResource('works.episodes', EpisodeController::class)->scoped()->only(['index', 'show']);
    // 話の作成・編集の送信は利用者ごとに回数を制限する(docs/adr/0023)
    Route::middleware('throttle:'.EpisodeRateLimitServiceProvider::LIMITER)->group(function () {
        Route::apiResource('works.episodes', EpisodeController::class)->scoped()->only(['store', 'update']);
        Route::post('works/{work}/episodes/{episode}/publication', [EpisodePublicationController::class, 'store'])->scopeBindings();
    });
});
