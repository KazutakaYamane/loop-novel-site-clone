<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

afterEach(function () {
    Str::createRandomStringsNormally();
});

test('a demo reader button creates a new user and logs in as that user', function () {
    $response = $this->postJson('/api/demo-sessions', ['role' => 'reader']);

    $response->assertCreated();
    expect(User::count())->toBe(1);
    $user = User::sole();
    $this->assertAuthenticatedAs($user);
    $response->assertExactJson(['name' => $user->name]);
})->group('AC-F2-2', 'AC-F2-6');

test('a demo author button creates a new user and logs in as that user', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'author'])->assertCreated();

    expect(User::count())->toBe(1);
    $this->assertAuthenticatedAs(User::sole());
})->group('AC-F2-2');

test('readers and authors get different names', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'author'])->assertCreated();
    $this->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated();

    expect(User::query()->orderBy('id')->pluck('name')->all())->toBe(['デモ作者', 'デモ読者']);
})->group('AC-F2-2');

test('each press creates another user', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated();
    $this->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated();

    expect(User::count())->toBe(2)
        ->and(User::query()->distinct()->count('email'))->toBe(2);
})->group('AC-F2-2');

test('an unknown role is rejected without creating a user', function (mixed $role) {
    $this->postJson('/api/demo-sessions', ['role' => $role])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');

    expect(User::count())->toBe(0);
    $this->assertGuest();
})->with([['admin'], [''], [null], [['reader']]])->group('AC-F2-2');

test('a demo user has an address in a reserved domain and no personal information', function () {
    $this->postJson('/api/demo-sessions', ['role' => 'reader'])->assertCreated();

    $user = User::sole();
    expect($user->email)->toMatch('/^[a-z0-9-]+@example\.com$/')
        ->and($user->name)->toBe('デモ読者')
        ->and($user->email_verified_at)->toBeNull();
})->group('AC-F2-8');

test('the generated password is not shown, logged, or stored except as a hash', function () {
    $password = 'known-password-'.str_repeat('x', 49);
    // セッション ID や CSRF トークンも Str::random で作られるので、パスワードの長さのときだけ既知の値にする
    Str::createRandomStringsUsing(fn (int $length) => $length === 64 ? $password : substr(bin2hex(random_bytes($length)), 0, $length));
    $logged = [];
    Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged) {
        $logged[] = $event->message.json_encode($event->context);
    });

    $response = $this->postJson('/api/demo-sessions', ['role' => 'reader']);

    $response->assertCreated();
    $row = (array) DB::table('users')->sole();
    expect(password_verify($password, (string) $row['password']))->toBeTrue()
        ->and($response->getContent())->not->toContain($password)
        ->and(json_encode(session()->all()))->not->toContain($password)
        ->and(implode("\n", $logged))->not->toContain($password);
    foreach ($row as $value) {
        expect((string) $value)->not->toContain($password);
    }
})->group('AC-F2-8');

test('there is no route that registers or logs in with an email and password', function () {
    $uris = collect(Route::getRoutes()->getRoutes())->map(fn ($route) => $route->uri());

    expect($uris->filter(fn (string $uri) => preg_match('/register|login|signup|password/i', $uri) === 1)->all())->toBe([]);
    $this->postJson('/api/register', ['name' => 'a', 'email' => 'a@example.com', 'password' => 'secret-secret'])->assertNotFound();
    $this->postJson('/api/login', ['email' => 'a@example.com', 'password' => 'secret-secret'])->assertNotFound();
    expect(User::count())->toBe(0);
})->group('AC-F2-2');
