<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Models\Work;
use App\Seed\Aozora\SeedAozoraWorks;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Console\Command;
use Illuminate\Contracts\Console\Isolatable;
use Illuminate\Contracts\Queue\ClearableQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use RuntimeException;

final class ResetDemoCommand extends Command implements Isolatable
{
    protected $signature = 'app:reset';

    protected $description = 'Restore the demo to its bundled seed data';

    public function handle(DatabaseSeeder $seeder, SeedAozoraWorks $seed): int
    {
        DB::transaction(function () use ($seeder, $seed) {
            $works = $seeder->run($seed);
            // 採番を戻すと古い URL やセッションが別のレコードを指すため、既存のシードを上書きしてから余分な行を消す。
            Work::query()->whereKeyNot(array_map(fn (Work $work) => $work->id, $works))->delete();
            User::query()->whereKeyNot(array_map(fn (Work $work) => $work->user_id, $works))->delete();

            foreach (['sessions', 'password_reset_tokens', 'jobs', 'job_batches', 'failed_jobs', 'cache', 'cache_locks'] as $table) {
                DB::table($table)->delete();
            }

            $queue = Queue::connection();
            if ($queue instanceof ClearableQueue) {
                $queue->clear(config()->string('queue.connections.'.config()->string('queue.default').'.queue', 'default'));
            }

            if (! Cache::flush()) {
                throw new RuntimeException('Could not clear the demo cache.');
            }
        }, 3);

        $this->info('Demo data reset.');

        return self::SUCCESS;
    }
}
