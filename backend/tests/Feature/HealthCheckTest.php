<?php

declare(strict_types=1);

test('the health check endpoint responds with 200', function () {
    $this->get('/up')->assertOk();
});

test('ヘルスチェックの GET /up は 200 を返す', function () {
    $this->get('/up')->assertStatus(200);
});
