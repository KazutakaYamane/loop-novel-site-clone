<?php

declare(strict_types=1);

// 送信元の IP は nginx が REMOTE_ADDR に入れた値で決まる(docs/adr/0017)。ここでは REMOTE_ADDR を直接与える
function demoLoginFrom(string $ip, array $headers = []): Illuminate\Testing\TestResponse
{
    return test()->withServerVariables(['REMOTE_ADDR' => $ip])
        ->withHeaders($headers)
        ->postJson('/api/demo-sessions', ['role' => 'reader']);
}

test('ten demo logins an hour from one IP address succeed and the eleventh is refused', function () {
    for ($i = 1; $i <= 10; $i++) {
        demoLoginFrom('203.0.113.10')->assertCreated();
    }

    demoLoginFrom('203.0.113.10')->assertStatus(429);
    $this->assertDatabaseCount('users', 10);
})->group('AC-F2-7');

test('the limit is counted for each IP address', function () {
    for ($i = 1; $i <= 10; $i++) {
        demoLoginFrom('203.0.113.10')->assertCreated();
    }
    demoLoginFrom('203.0.113.10')->assertStatus(429);

    demoLoginFrom('203.0.113.11')->assertCreated();
    demoLoginFrom('2001:db8::1')->assertCreated();
})->group('AC-F2-7');

test('forwarding headers sent to Laravel do not change the IP address the limit counts', function () {
    for ($i = 1; $i <= 10; $i++) {
        demoLoginFrom('203.0.113.10', ['X-Forwarded-For' => "198.51.100.{$i}", 'X-User-IP' => "198.51.100.{$i}"])
            ->assertCreated();
    }

    demoLoginFrom('203.0.113.10', ['X-Forwarded-For' => '198.51.100.99', 'X-User-IP' => '198.51.100.99'])
        ->assertStatus(429);
})->group('AC-F2-7');

test('the limit is lifted one hour after the first demo login and not before', function () {
    $this->freezeSecond();
    for ($i = 1; $i <= 10; $i++) {
        demoLoginFrom('203.0.113.10')->assertCreated();
    }

    $this->travel(3599)->seconds();
    demoLoginFrom('203.0.113.10')->assertStatus(429);

    $this->travel(1)->seconds();
    demoLoginFrom('203.0.113.10')->assertCreated();
})->group('AC-F2-7');

test('a refused demo login creates no user', function () {
    for ($i = 1; $i <= 10; $i++) {
        demoLoginFrom('203.0.113.10')->assertCreated();
    }

    $refused = demoLoginFrom('203.0.113.10');

    $refused->assertStatus(429);
    $this->assertDatabaseCount('users', 10);
})->group('AC-F2-7');
