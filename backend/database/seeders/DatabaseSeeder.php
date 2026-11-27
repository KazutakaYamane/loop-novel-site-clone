<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Work;
use App\Seed\Aozora\SeedAozoraWorks;
use App\Seed\Aozora\SeedDirectory;
use Illuminate\Database\Seeder;

// 開発・E2E・CI の DB に入れるシード。scripts/worktree-setup.sh がマイグレーションの後に実行する(docs/adr/0030)
class DatabaseSeeder extends Seeder
{
    /** @return list<Work> */
    public function run(SeedAozoraWorks $seed): array
    {
        return $seed->handle(new SeedDirectory(database_path('data/aozora')));
    }
}
