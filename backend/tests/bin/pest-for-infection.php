#!/usr/bin/env php
<?php

declare(strict_types=1);

// Infection 0.35 は Pest の専用アダプタを持たないので、PHPUnit として Pest を呼ばせるための包み。
// - Infection は --version の出力で PHPUnit の版を判断し、生成する設定ファイルの書式を変える。
//   Pest は自分の版(5.x)を返し PHPUnit 5 と誤認されるので、Pest が使っている PHPUnit の版を返す。
// - カバレッジは Pest が生成するクラス名(P\Tests\...)でテストを記録するが、JUnit のログは元の名前(Tests\...)を使う。
//   Infection は両者を名前で突き合わせるので、JUnit のログの名前をカバレッジに合わせる。
$root = dirname(__DIR__, 2);
$args = array_slice($argv, 1);
$binary = ($args[0] ?? null) === '--version' ? 'phpunit' : 'pest';

passthru(
    escapeshellarg(PHP_BINARY).' '.escapeshellarg("{$root}/vendor/bin/{$binary}").' '
        .implode(' ', array_map(escapeshellarg(...), $args)),
    $code,
);

foreach ($args as $arg) {
    if (str_starts_with($arg, '--log-junit=')) {
        $path = substr($arg, strlen('--log-junit='));
        $xml = file_get_contents($path);
        if ($xml !== false) {
            $xml = preg_replace('/(<testsuite name="|class=")(Tests\\\\)/', '$1P\\\\$2', $xml);
            file_put_contents($path, (string) $xml);
        }
    }
}

exit($code);
