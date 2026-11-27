<?php

declare(strict_types=1);

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

beforeEach(function () {
    $this->dir = sys_get_temp_dir().'/aozora-'.bin2hex(random_bytes(6));
    File::ensureDirectoryExists($this->dir);
    File::put($this->dir.'/manifest.json', json_encode([
        ['slug' => 'kumo', 'source' => 'https://www.aozora.gr.jp/cards/000879/files/92_ruby_164.zip'],
        ['slug' => 'hana', 'source' => 'https://www.aozora.gr.jp/cards/000879/files/42_ruby_154.zip'],
    ]));
});

afterEach(function () {
    File::deleteDirectory($this->dir);
});

// 青空文庫の配布の形(Shift_JIS のテキスト 1 つを入れた zip)を作る
function aozoraZip(string $text): string
{
    $path = tempnam(sys_get_temp_dir(), 'zip');
    $zip = new ZipArchive;
    $zip->open($path, ZipArchive::OVERWRITE);
    $zip->addFromString('readme.html', '<p>not the text</p>');
    $zip->addFromString('kumonoito.txt', (string) mb_convert_encoding($text, 'SJIS-win', 'UTF-8'));
    $zip->close();
    $bytes = (string) file_get_contents($path);
    unlink($path);

    return $bytes;
}

test('aozora:fetch saves each listed text as UTF-8, one request at a time with a pause between them', function () {
    Sleep::fake();
    Http::preventStrayRequests();
    Http::fake([
        'www.aozora.gr.jp/cards/000879/files/92_ruby_164.zip' => Http::response(aozoraZip("蜘蛛の糸\r\n～御釈迦様《おしゃかさま》\r\n")),
        'www.aozora.gr.jp/cards/000879/files/42_ruby_154.zip' => Http::response(aozoraZip("鼻\r\n禅智内供《ぜんちないぐ》\r\n")),
    ]);

    $this->artisan('aozora:fetch', ['--data' => $this->dir])->assertSuccessful();

    expect(File::get($this->dir.'/source/kumo.txt'))->toBe("蜘蛛の糸\r\n～御釈迦様《おしゃかさま》\r\n")
        ->and(File::get($this->dir.'/source/hana.txt'))->toBe("鼻\r\n禅智内供《ぜんちないぐ》\r\n");
    Http::assertSentCount(2);
    Http::assertSent(fn (Request $request) => $request->hasHeader('User-Agent', 'yomikaki-seed-fetch'));
    Sleep::assertSleptTimes(1);
    Sleep::assertSlept(fn ($duration) => $duration->totalSeconds >= 1);
})->group('AC-F8-5');

test('aozora:fetch does not request texts that are already saved', function () {
    Sleep::fake();
    Http::preventStrayRequests();
    Http::fake(['www.aozora.gr.jp/cards/000879/files/42_ruby_154.zip' => Http::response(aozoraZip("鼻\r\n"))]);
    File::ensureDirectoryExists($this->dir.'/source');
    File::put($this->dir.'/source/kumo.txt', '保存済み');

    $this->artisan('aozora:fetch', ['--data' => $this->dir])->assertSuccessful();

    expect(File::get($this->dir.'/source/kumo.txt'))->toBe('保存済み');
    Http::assertSentCount(1);
    Sleep::assertNeverSlept();
})->group('AC-F8-5');

test('aozora:fetch stops when the archive has no text file', function () {
    Sleep::fake();
    Http::preventStrayRequests();
    $path = tempnam(sys_get_temp_dir(), 'zip');
    $zip = new ZipArchive;
    $zip->open($path, ZipArchive::OVERWRITE);
    $zip->addFromString('readme.html', '<p></p>');
    $zip->close();
    Http::fake(['*' => Http::response((string) file_get_contents($path))]);
    unlink($path);

    expect(fn () => $this->artisan('aozora:fetch', ['--data' => $this->dir])->run())
        ->toThrow(RuntimeException::class, '92_ruby_164.zip');
    expect(File::exists($this->dir.'/source/kumo.txt'))->toBeFalse();
})->group('AC-F8-5');

test('aozora:fetch stops when the download fails', function () {
    Sleep::fake();
    Http::preventStrayRequests();
    Http::fake(['*' => Http::response('', 404)]);

    expect(fn () => $this->artisan('aozora:fetch', ['--data' => $this->dir])->run())
        ->toThrow(Illuminate\Http\Client\RequestException::class);
})->group('AC-F8-5');

test('aozora:convert writes the converted work of each saved text without the network', function () {
    Http::preventStrayRequests();
    File::ensureDirectoryExists($this->dir.'/source');
    $source = "蜘蛛の糸\r\n芥川竜之介\r\n\r\n［＃「一」は中見出し］\r\n　御釈迦様《おしゃかさま》は［＃「は」は底本では「が」］\r\n\r\n底本：「蜘蛛の糸」\r\n入力：蒋龍\r\n";
    File::put($this->dir.'/source/kumo.txt', $source);
    File::put($this->dir.'/source/hana.txt', "鼻\r\n芥川竜之介\r\n\r\n　内供の鼻\r\n\r\n底本：「鼻」\r\n");

    $this->artisan('aozora:convert', ['--data' => $this->dir])->assertSuccessful();

    expect(json_decode(File::get($this->dir.'/works/kumo.json'), true))->toBe([
        'title' => '蜘蛛の糸',
        'author' => '芥川竜之介',
        'episodes' => [['title' => '一', 'body' => '　御釈迦様《おしゃかさま》は']],
        'credit' => "底本：「蜘蛛の糸」\n入力：蒋龍",
    ])
        ->and(File::get($this->dir.'/works/kumo.json'))->toContain('"蜘蛛の糸"')->toEndWith("}\n")
        ->and(json_decode(File::get($this->dir.'/works/hana.json'), true)['title'])->toBe('鼻');
})->group('AC-F8-3', 'AC-F8-5');
