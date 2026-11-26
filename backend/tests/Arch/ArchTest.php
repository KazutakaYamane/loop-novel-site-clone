<?php

declare(strict_types=1);

arch('no debugging or unsafe PHP functions')->preset()->php();

arch('no insecure functions')->preset()->security();

arch('application code follows Laravel conventions')->preset()->laravel();

arch('application code declares strict types')
    ->expect('App')
    ->toUseStrictTypes();

// 環境変数は config/ で一度だけ読む。アプリのコードが env() で動きを変えると、テスト環境だけの分岐を書けてしまう
arch('application code does not read environment variables directly')
    ->expect('App')
    ->not->toUse(['env', 'getenv', 'putenv']);
