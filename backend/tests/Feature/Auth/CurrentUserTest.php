<?php

declare(strict_types=1);

use App\Models\User;

test('a guest has no current user', function () {
    $this->getJson('/api/user')->assertUnauthorized();
});

test('the current user is returned without the email or password', function () {
    $user = User::factory()->create(['name' => 'ログイン中の人']);

    $this->actingAs($user)->getJson('/api/user')
        ->assertOk()
        ->assertExactJson(['name' => 'ログイン中の人']);
});

test('after a demo login the same session sees the new user', function () {
    $response = $this->postJson('/api/demo-sessions', ['role' => 'reader']);
    $session = $response->getCookie('yomikaki_session', false);
    expect($session)->not->toBeNull();

    $this->withUnencryptedCookie('yomikaki_session', (string) $session?->getValue())
        ->getJson('/api/user')
        ->assertOk()
        ->assertExactJson(['name' => 'デモ読者']);
})->group('AC-F2-2');
