<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 上限は docs/adr/0021。本文の 10 万文字は 1 文字 3〜4 バイトで TEXT(65535 バイト)を超えるので MEDIUMTEXT にする
        Schema::create('episodes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_id')->constrained()->cascadeOnDelete();
            $table->string('title', 100);
            $table->mediumText('body');
            $table->string('status', 20)->default('draft');
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            // 作品の中の並びは作った順(id の順)
            $table->index(['work_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('episodes');
    }
};
