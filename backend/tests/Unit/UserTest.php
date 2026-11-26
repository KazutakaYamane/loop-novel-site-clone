<?php

declare(strict_types=1);

use App\Models\User;

test('the password and remember token are hidden when a user is serialized', function () {
    $user = new User([
        'name' => 'Hidden Fields',
        'email' => 'hidden@example.com',
        'password' => 'secret-password',
    ]);
    $user->setRememberToken('remember-token');

    expect($user->toArray())
        ->toHaveKey('name', 'Hidden Fields')
        ->not->toHaveKey('password')
        ->not->toHaveKey('remember_token');
});

test('the password is hashed when it is assigned', function () {
    $user = new User(['password' => 'secret-password']);

    expect($user->password)->not->toBe('secret-password')
        ->and(password_verify('secret-password', $user->password))->toBeTrue();
});

test('the email verification time is read as a date', function () {
    $user = new User;
    $user->setRawAttributes(['email_verified_at' => '2026-11-26 04:00:00']);

    expect($user->email_verified_at)->toBeInstanceOf(DateTimeInterface::class)
        ->and($user->email_verified_at?->format('Y-m-d H:i'))->toBe('2026-11-26 04:00');
});
