<?php

declare(strict_types=1);

use App\Http\Controllers\Auth\CsrfTokenController;
use App\Http\Controllers\Auth\CurrentUserController;
use App\Http\Controllers\Auth\DemoSessionController;
use App\Http\Controllers\Auth\SessionController;
use Illuminate\Support\Facades\Route;

Route::get('/csrf-token', [CsrfTokenController::class, 'show']);
Route::post('/demo-sessions', [DemoSessionController::class, 'store'])->middleware('throttle:demo-login');
Route::get('/user', [CurrentUserController::class, 'show'])->middleware('auth');
Route::delete('/session', [SessionController::class, 'destroy']);
