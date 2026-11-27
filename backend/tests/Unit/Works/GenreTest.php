<?php

declare(strict_types=1);

use App\Enums\Genre;
use App\Enums\SerialStatus;

test('the genres are the twelve kakuyomu genres in the order of its form', function () {
    $genres = array_map(fn (Genre $genre) => [$genre->value, $genre->label()], Genre::cases());

    expect($genres)->toBe([
        ['fantasy', '異世界ファンタジー'],
        ['action', '現代ファンタジー'],
        ['sf', 'SF'],
        ['love_story', '恋愛'],
        ['romance', 'ラブコメ'],
        ['drama', '現代ドラマ'],
        ['horror', 'ホラー'],
        ['mystery', 'ミステリー'],
        ['nonfiction', 'エッセイ・ノンフィクション'],
        ['history', '歴史・時代・伝奇'],
        ['criticism', '創作論・評論'],
        ['others', '詩・童話・その他'],
    ]);
})->group('AC-F3-3');

test('a work is either running or completed', function () {
    expect(array_map(fn (SerialStatus $status) => $status->value, SerialStatus::cases()))
        ->toBe(['running', 'completed']);
})->group('AC-F3-2');
