<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;

test('only a browser that previously logged in receives an expired-session indication', function () {
    $this->withCredentials()->getJson('/api/user')
        ->assertUnauthorized()->assertHeaderMissing('X-Demo-Session-Expired');
    $this->getJson('/api/csrf-token')->assertOk()->assertHeaderMissing('X-Demo-Session-Expired');

    $login = $this->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated();
    $marker = $login->getCookie('yomikaki_previous_login', false);
    expect($marker)->not->toBeNull();
    expect($marker->isHttpOnly())->toBeTrue()
        ->and($marker->getSameSite())->toBe('lax')
        ->and($marker->getExpiresTime())->toBeGreaterThan($login->getCookie('yomikaki_session', false)->getExpiresTime());

    config(['session.driver' => 'database']);
    app('session')->forgetDrivers();
    app()->forgetInstance('session.store');
    app('auth')->forgetGuards();
    DB::table('sessions')->delete();

    $this->withUnencryptedCookie('yomikaki_previous_login', (string) $marker->getValue())
        ->getJson('/api/user')->assertUnauthorized()->assertHeader('X-Demo-Session-Expired', '1');
    $this->getJson('/api/csrf-token')->assertOk()->assertHeader('X-Demo-Session-Expired', '1');

    $this->withUnencryptedCookie('yomikaki_previous_login', 'forged')
        ->getJson('/api/user')->assertUnauthorized()->assertHeaderMissing('X-Demo-Session-Expired');
})->group('AC-F9-4');

test('logging out expires the previous login cookie', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated();

    $this->deleteJson('/api/session')->assertNoContent()->assertCookieExpired('yomikaki_previous_login');
})->group('AC-F9-4');
