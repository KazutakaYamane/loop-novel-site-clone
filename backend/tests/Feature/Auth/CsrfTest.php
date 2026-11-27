<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Testing\TestResponse;

// フレームワークは単体テストの実行中だけ CSRF の検証を飛ばす。その判定だけを外して、本物の検証を通す
beforeEach(function () {
    $this->app->singleton(PreventRequestForgery::class, fn ($app) => new class($app, $app['encrypter']) extends PreventRequestForgery
    {
        protected function runningUnitTests()
        {
            return false;
        }
    });
});

/**
 * @return array{session: string, token: string}
 */
function startGuestSession(Tests\TestCase $test): array
{
    $response = $test->getJson('/api/csrf-token')->assertOk();

    return [
        'session' => (string) $response->getCookie('yomikaki_session', false)?->getValue(),
        'token' => (string) $response->json('token'),
    ];
}

function postDemo(Tests\TestCase $test, string $session, array $headers): TestResponse
{
    return $test->withUnencryptedCookie('yomikaki_session', $session)
        ->withHeaders($headers)
        ->postJson('/api/demo-sessions', ['role' => 'reader']);
}

test('a request with the session csrf token is accepted', function () {
    ['session' => $session, 'token' => $token] = startGuestSession($this);

    postDemo($this, $session, ['X-CSRF-TOKEN' => $token])->assertCreated();

    expect(User::count())->toBe(1);
})->group('AC-F1-4');

test('a same-origin request from the browser is accepted', function () {
    postDemo($this, '', ['Sec-Fetch-Site' => 'same-origin'])->assertCreated();

    expect(User::count())->toBe(1);
})->group('AC-F1-4');

test('a request without a csrf token is rejected', function () {
    ['session' => $session] = startGuestSession($this);

    postDemo($this, $session, [])->assertStatus(419);

    expect(User::count())->toBe(0);
    $this->assertGuest();
})->group('AC-F1-4');

test('a request with a forged csrf token is rejected', function () {
    ['session' => $session] = startGuestSession($this);

    postDemo($this, $session, ['X-CSRF-TOKEN' => str_repeat('a', 40)])->assertStatus(419);
    postDemo($this, $session, ['X-XSRF-TOKEN' => 'forged'])->assertStatus(419);

    expect(User::count())->toBe(0);
})->group('AC-F1-4');

test('a request sent from another site is rejected', function (string $site) {
    ['session' => $session] = startGuestSession($this);

    postDemo($this, $session, ['Sec-Fetch-Site' => $site, 'Origin' => 'https://evil.example'])->assertStatus(419);

    expect(User::count())->toBe(0);
})->with(['cross-site', 'same-site', 'none'])->group('AC-F1-4');

test('a token from another session is rejected', function () {
    ['token' => $otherToken] = startGuestSession($this);
    $this->flushSession();
    ['session' => $session] = startGuestSession($this);

    postDemo($this, $session, ['X-CSRF-TOKEN' => $otherToken])->assertStatus(419);

    expect(User::count())->toBe(0);
})->group('AC-F1-4');

test('other sites cannot read the api through cors', function () {
    $this->withHeaders([
        'Origin' => 'https://evil.example',
        'Access-Control-Request-Method' => 'GET',
    ])->options('/api/csrf-token')->assertHeaderMissing('Access-Control-Allow-Origin');

    $this->withHeader('Origin', 'https://evil.example')
        ->getJson('/api/csrf-token')
        ->assertHeaderMissing('Access-Control-Allow-Origin');
})->group('AC-F1-4');
