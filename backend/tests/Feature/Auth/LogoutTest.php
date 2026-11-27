<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;

// フレームワークは単体テストの実行中だけ CSRF の検証を飛ばす。その判定だけを外して、本物の検証を通す。
// テストの中の複数のリクエストは同じアプリを使い回し、セッションの中身とログイン中の利用者を持ち越すので、
// 本番と同じ database のセッションにして、リクエストごとに読み直す(asBrowser)
beforeEach(function () {
    config(['session.driver' => 'database']);
    $this->app->singleton(PreventRequestForgery::class, fn ($app) => new class($app, $app['encrypter']) extends PreventRequestForgery
    {
        protected function runningUnitTests()
        {
            return false;
        }
    });
});

// 別のプロセスで受けたリクエストと同じく、セッションとログイン中の利用者を DB と cookie から読み直させる。
// JSON のリクエストは withCredentials() を付けないと cookie を送らない
function asBrowser(Tests\TestCase $test, string $session): Tests\TestCase
{
    $test->flushHeaders();
    app('session')->forgetDrivers();
    app()->forgetInstance('session.store');
    app('auth')->forgetGuards();

    return $test->withCredentials()->withUnencryptedCookie('yomikaki_session', $session);
}

/**
 * ブラウザと同じく、セッションの cookie だけを持ち回る利用者
 *
 * @return array{session: string, token: string}
 */
function demoLoginAsBrowser(Tests\TestCase $test, string $role = 'reader'): array
{
    $guest = asBrowser($test, '')->getJson('/api/csrf-token')->assertOk();
    $session = (string) $guest->getCookie('yomikaki_session', false)?->getValue();
    $login = asBrowser($test, $session)
        ->withHeader('X-CSRF-TOKEN', (string) $guest->json('token'))
        ->postJson('/api/demo-sessions', ['role' => $role])
        ->assertCreated();
    $session = (string) $login->getCookie('yomikaki_session', false)?->getValue();
    $token = asBrowser($test, $session)->getJson('/api/csrf-token')->json('token');

    return ['session' => $session, 'token' => (string) $token];
}

function currentUserStatus(Tests\TestCase $test, string $session): int
{
    return asBrowser($test, $session)->getJson('/api/user')->status();
}

function logOutAsBrowser(Tests\TestCase $test, string $session, array $headers): TestResponse
{
    return asBrowser($test, $session)
        ->withHeaders($headers)
        ->deleteJson('/api/session');
}

test('after logging out, the session no longer reaches pages that need a login', function () {
    ['session' => $session, 'token' => $token] = demoLoginAsBrowser($this);
    expect(currentUserStatus($this, $session))->toBe(200);

    logOutAsBrowser($this, $session, ['X-CSRF-TOKEN' => $token])->assertNoContent();

    expect(currentUserStatus($this, $session))->toBe(401);
})->group('AC-F1-1');

test('logging out issues a fresh session and csrf token', function () {
    ['session' => $session, 'token' => $token] = demoLoginAsBrowser($this);

    $response = logOutAsBrowser($this, $session, ['X-CSRF-TOKEN' => $token])->assertNoContent();

    $newSession = (string) $response->getCookie('yomikaki_session', false)?->getValue();
    expect($newSession)->not->toBe('')->not->toBe($session);
    $newToken = asBrowser($this, $newSession)->getJson('/api/csrf-token')->json('token');
    expect($newToken)->not->toBe($token);
    expect(currentUserStatus($this, $newSession))->toBe(401);
})->group('AC-F1-1');

test('a logout without a csrf token is rejected and keeps the user logged in', function (array $headers) {
    ['session' => $session] = demoLoginAsBrowser($this);

    logOutAsBrowser($this, $session, $headers)->assertStatus(419);

    expect(currentUserStatus($this, $session))->toBe(200);
})->with([
    'missing' => [[]],
    'forged' => [['X-CSRF-TOKEN' => str_repeat('a', 40)]],
    'from another site' => [['Sec-Fetch-Site' => 'cross-site', 'Origin' => 'https://evil.example']],
])->group('AC-F1-1');

test('logging out does not log out another user', function () {
    ['session' => $mine, 'token' => $token] = demoLoginAsBrowser($this);
    ['session' => $theirs] = demoLoginAsBrowser($this);

    logOutAsBrowser($this, $mine, ['X-CSRF-TOKEN' => $token])->assertNoContent();

    expect(currentUserStatus($this, $mine))->toBe(401)
        ->and(currentUserStatus($this, $theirs))->toBe(200);
})->group('AC-F1-1');

test('a guest logging out stays a guest', function () {
    $guest = asBrowser($this, '')->getJson('/api/csrf-token')->assertOk();
    $session = (string) $guest->getCookie('yomikaki_session', false)?->getValue();

    logOutAsBrowser($this, $session, ['X-CSRF-TOKEN' => (string) $guest->json('token')])->assertNoContent();

    expect(currentUserStatus($this, $session))->toBe(401);
    expect(User::count())->toBe(0);
})->group('AC-F1-1');

test('pressing the demo button again after logging out makes a new user', function () {
    ['session' => $session, 'token' => $token] = demoLoginAsBrowser($this);
    $first = User::sole();
    logOutAsBrowser($this, $session, ['X-CSRF-TOKEN' => $token])->assertNoContent();

    ['session' => $again] = demoLoginAsBrowser($this);

    expect(User::count())->toBe(2);
    $second = User::query()->whereKeyNot($first->getKey())->sole();
    asBrowser($this, $again)->getJson('/api/user')
        ->assertOk()
        ->assertExactJson(['name' => $second->name]);
    expect($second->name)->not->toBe($first->name);
})->group('AC-F2-4');

test('a demo login from a session whose login has expired makes a new user', function () {
    ['session' => $session] = demoLoginAsBrowser($this);
    $first = User::sole();
    // ログイン状態が切れた後と同じく、サーバー側にセッションが残っていない cookie で押す
    DB::table('sessions')->delete();
    expect(currentUserStatus($this, $session))->toBe(401);

    $token = asBrowser($this, $session)->getJson('/api/csrf-token');
    $newSession = (string) $token->getCookie('yomikaki_session', false)?->getValue();
    asBrowser($this, $newSession)
        ->withHeader('X-CSRF-TOKEN', (string) $token->json('token'))
        ->postJson('/api/demo-sessions', ['role' => 'reader'])
        ->assertCreated();

    expect(User::count())->toBe(2)
        ->and(User::query()->whereKeyNot($first->getKey())->sole()->name)->not->toBe($first->name);
})->group('AC-F2-4');

// 後の issue が足す更新の経路と関係なく、ログインの唯一の入口であるデモログインで確かめる
// (パスワードでのログインをデモログインの外から呼べないことは tests/Arch/AuthTest.php が確かめる)
test('the demo login cannot be pointed at an existing user', function () {
    ['session' => $session, 'token' => $token] = demoLoginAsBrowser($this);
    $first = User::sole();
    logOutAsBrowser($this, $session, ['X-CSRF-TOKEN' => $token])->assertNoContent();

    $guest = asBrowser($this, '')->getJson('/api/csrf-token')->assertOk();
    $guestSession = (string) $guest->getCookie('yomikaki_session', false)?->getValue();
    $login = asBrowser($this, $guestSession)
        ->withHeader('X-CSRF-TOKEN', (string) $guest->json('token'))
        ->postJson('/api/demo-sessions', [
            'role' => 'reader',
            'id' => $first->getKey(),
            'user_id' => $first->getKey(),
            'email' => $first->email,
            'name' => $first->name,
        ])
        ->assertCreated();
    $again = (string) $login->getCookie('yomikaki_session', false)?->getValue();

    expect(User::count())->toBe(2);
    $second = User::query()->whereKeyNot($first->getKey())->sole();
    asBrowser($this, $again)->getJson('/api/user')
        ->assertOk()
        ->assertExactJson(['name' => $second->name]);
    expect($second->name)->not->toBe($first->name);
})->group('AC-F2-4');
