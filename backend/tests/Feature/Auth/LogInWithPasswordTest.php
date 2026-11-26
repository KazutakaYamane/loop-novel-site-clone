<?php

declare(strict_types=1);

use App\Actions\Auth\LogInWithPassword;
use App\Actions\Auth\RegisterUser;
use App\Models\User;

test('registering stores the user with a hashed password', function () {
    $user = app(RegisterUser::class)->handle('名前', 'someone@example.com', 'a-long-secret-password');

    expect($user->exists)->toBeTrue()
        ->and($user->name)->toBe('名前')
        ->and($user->email)->toBe('someone@example.com')
        ->and(password_verify('a-long-secret-password', $user->password))->toBeTrue();
    $this->assertGuest();
})->group('AC-F2-2');

test('logging in with the right email and password authenticates the user', function () {
    $user = User::factory()->create(['email' => 'someone@example.com']);

    $result = app(LogInWithPassword::class)->handle('someone@example.com', 'password');

    expect($result?->is($user))->toBeTrue();
    $this->assertAuthenticatedAs($user);
})->group('AC-F2-2');

test('logging in with a wrong password or unknown email fails', function (string $email, string $password) {
    User::factory()->create(['email' => 'someone@example.com']);

    expect(app(LogInWithPassword::class)->handle($email, $password))->toBeNull();
    $this->assertGuest();
})->with([
    ['someone@example.com', 'wrong-password'],
    ['nobody@example.com', 'password'],
])->group('AC-F2-2');
