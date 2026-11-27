<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Seed\Aozora\AozoraText;
use App\Seed\Aozora\SeedDirectory;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

// 取得したテキスト(source/)を、シードが読む作品のデータ(works/)に変換する。ネットワークは使わない
final class AozoraConvertCommand extends Command
{
    protected $signature = 'aozora:convert {--data= : シードのデータのディレクトリ(既定は database/data/aozora)}';

    protected $description = '取得した青空文庫のテキストを、シードの作品のデータに変換する';

    public function handle(AozoraText $converter): int
    {
        $option = $this->option('data');
        $directory = new SeedDirectory(is_string($option) ? $option : database_path('data/aozora'));
        foreach ($directory->entries() as $entry) {
            $slug = SeedDirectory::string($entry, 'slug');
            $work = $converter->convert(File::get($directory->sourcePath($slug)));
            $target = $directory->workPath($slug);
            File::ensureDirectoryExists(dirname($target));
            File::put($target, json_encode($work, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n");
            $this->info($target);
        }

        return self::SUCCESS;
    }
}
