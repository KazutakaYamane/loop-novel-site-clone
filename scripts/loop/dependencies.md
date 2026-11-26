# 依存の許可リスト

初期設定で人間が決める。ループのエージェントは編集しない(AGENTS.md)。

- ループは、この表にあるパッケージを、制約の範囲のバージョンで追加・更新してよい。表にないパッケージの追加と、制約を超える更新は人間に上げる。
- 使わなくなった依存の削除は自由。
- 比較を公平にするため、人間がレビューする版(`novel-site-clone`)と同じ主要バージョンにそろえている。
- CI の guard ジョブは、`composer.json` と各 `package.json` の差分をこの表と照らし合わせる。表の書式(`| エコシステム | パッケージ | 制約 |`)を変えるときは guard も直す。

| エコシステム | パッケージ | 制約 |
|---|---|---|
| composer | php | ^8.5 |
| composer | laravel/framework | ^13.0 |
| composer | laravel/sanctum | ^4.0 |
| composer | laravel/tinker | ^3.0 |
| composer | predis/predis | ^3.0 |
| composer | dedoc/scramble | ^0.13 |
| composer | fakerphp/faker | ^1.23 |
| composer | mockery/mockery | ^1.6 |
| composer | nunomaduro/collision | ^8.0 |
| composer | laravel/pint | ^1.0 |
| composer | larastan/larastan | ^3.0 |
| composer | phpstan/phpstan | ^2.0 |
| composer | pestphp/pest | ^5.0 |
| composer | pestphp/pest-plugin-laravel | ^5.0 |
| composer | infection/infection | ^0.35 |
| npm | next | ^16.0 |
| npm | react | ^19.0 |
| npm | react-dom | ^19.0 |
| npm | server-only | ^0.0.1 |
| npm | ioredis | ^6.0 |
| npm | typescript | ^5.0 |
| npm | @types/node | * |
| npm | @types/react | ^19.0 |
| npm | @types/react-dom | ^19.0 |
| npm | eslint | ^9.0 |
| npm | eslint-config-next | ^16.0 |
| npm | stylelint | ^17.0 |
| npm | stylelint-config-standard | * |
| npm | vitest | ^5.0 |
| npm | @vitest/coverage-v8 | ^5.0 |
| npm | jsdom | * |
| npm | @testing-library/react | ^16.0 |
| npm | @testing-library/dom | ^10.0 |
| npm | @testing-library/user-event | ^14.0 |
| npm | @testing-library/jest-dom | * |
| npm | @stryker-mutator/core | ^10.0 |
| npm | @stryker-mutator/vitest-runner | ^10.0 |
| npm | @stryker-mutator/typescript-checker | ^10.0 |
| npm | openapi-typescript | ^7.0 |
| npm | @playwright/test | ^1.64 |
