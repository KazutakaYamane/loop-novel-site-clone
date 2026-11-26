<?php

declare(strict_types=1);

test('the login state cookie cannot be read by JavaScript and is not sent cross-site', function () {
    $response = $this->postJson('/api/demo-sessions', ['role' => 'reader']);

    $cookie = $response->getCookie('yomikaki_session', false);
    expect($cookie)->not->toBeNull()
        ->and($cookie?->isHttpOnly())->toBeTrue()
        ->and($cookie?->getSameSite())->toBe('lax');
})->group('AC-F1-3');

test('logging in issues a new session id and csrf token', function () {
    $first = $this->getJson('/api/csrf-token');
    $session = (string) $first->getCookie('yomikaki_session', false)?->getValue();
    $token = $first->json('token');

    $second = $this->withUnencryptedCookie('yomikaki_session', $session)
        ->withHeader('X-CSRF-TOKEN', $token)
        ->postJson('/api/demo-sessions', ['role' => 'reader']);

    $second->assertCreated();
    expect($second->getCookie('yomikaki_session', false)?->getValue())->not->toBe($session)
        ->and(session()->token())->not->toBe($token);
})->group('AC-F1-3');
