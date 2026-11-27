<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Seed\Aozora\AozoraArchive;
use App\Seed\Aozora\SeedDirectory;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Sleep;

// 開発のときに青空文庫からシードの作品のテキストを取得する。青空文庫に負荷をかけないよう、まだ無いものだけを 1 件ずつ、間を空けて取得する
final class AozoraFetchCommand extends Command
{
    protected $signature = 'aozora:fetch {--data= : シードのデータのディレクトリ(既定は database/data/aozora)}';

    protected $description = '青空文庫からシードの作品のテキストを取得して source/ に保存する';

    public function handle(AozoraArchive $archive): int
    {
        $directory = new SeedDirectory($this->dataPath());
        $fetched = 0;
        foreach ($directory->entries() as $entry) {
            $target = $directory->sourcePath(SeedDirectory::string($entry, 'slug'));
            if (File::exists($target)) {
                continue;
            }
            if ($fetched > 0) {
                Sleep::for(2)->seconds();
            }
            $text = $archive->fetchText(SeedDirectory::string($entry, 'source'));
            File::ensureDirectoryExists(dirname($target));
            File::put($target, $text);
            $fetched++;
            $this->info($target);
        }

        return self::SUCCESS;
    }

    private function dataPath(): string
    {
        $option = $this->option('data');

        return is_string($option) ? $option : database_path('data/aozora');
    }
}
