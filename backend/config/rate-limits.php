<?php

declare(strict_types=1);

// 回数の制限の値。テストの環境でも本番と同じ値で働かせるため、環境変数では変えない(docs/adr/0017)。
// compose.yaml の DEMO_RATE_LIMIT_PER_HOUR は人間がレビューする版から写したもので、このアプリは読まない
return [
    // デモログイン(POST /api/demo-sessions)の、IP アドレスごとの 1 時間あたりの回数(AC-F2-7)
    'demo_login_per_hour' => 10,
];
