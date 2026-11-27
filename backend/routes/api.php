<?php

declare(strict_types=1);

use App\Http\Controllers\Auth\CsrfTokenController;
use App\Http\Controllers\Auth\CurrentUserController;
use App\Http\Controllers\Auth\DemoSessionController;
use Illuminate\Support\Facades\Route;

Route::get('/csrf-token', [CsrfTokenController::class, 'show']);
Route::post('/demo-sessions', [DemoSessionController::class, 'store']);
Route::get('/user', [CurrentUserController::class, 'show'])->middleware('auth');
