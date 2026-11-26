<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Log;

/**
 * json チャンネルの出し先を一時ファイルに向け、書かれた行を読む。
 *
 * @return list<string>
 */
function writtenLogLines(string $path): array
{
    $lines = file($path, FILE_IGNORE_NEW_LINES);
    assert(is_array($lines));

    return $lines;
}

/**
 * @return array<string, mixed>
 */
function decodeLogLine(string $line): array
{
    $entry = json_decode($line, true, flags: JSON_THROW_ON_ERROR);
    assert(is_array($entry));

    /** @var array<string, mixed> $entry */
    return $entry;
}

beforeEach(function () {
    $path = tempnam(sys_get_temp_dir(), 'json-log-');
    assert(is_string($path));
    $this->logPath = $path;
    config(['logging.channels.json.with.stream' => $path]);
});

afterEach(function () {
    @unlink($this->logPath);
});

test('the default log channel writes one JSON object per line', function () {
    expect(config('logging.default'))->toBe('json');

    Log::info('一件目');
    Log::error('二件目');

    $lines = writtenLogLines($this->logPath);
    expect($lines)->toHaveCount(2)
        ->and(decodeLogLine($lines[0])['message'])->toBe('一件目')
        ->and(decodeLogLine($lines[1])['message'])->toBe('二件目');
});

test('a log entry has the level, the message, the time and the context', function () {
    Log::channel('json')->warning('作品 {id} を保存した', ['id' => 42, 'title' => 'テスト']);

    $entry = decodeLogLine(writtenLogLines($this->logPath)[0]);

    expect($entry['level_name'])->toBe('WARNING')
        ->and($entry['message'])->toBe('作品 42 を保存した')
        ->and($entry['context'])->toBe(['id' => 42, 'title' => 'テスト'])
        ->and($entry['datetime'])->toBeString()
        ->and(strtotime((string) $entry['datetime']))->toBeInt();
});

test('the json channel writes to stderr so that docker compose logs shows it', function () {
    $channel = require base_path('config/logging.php');
    assert(is_array($channel));

    expect($channel['channels']['json']['with']['stream'])->toBe('php://stderr');
});
