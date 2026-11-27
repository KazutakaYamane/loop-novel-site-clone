<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 文字数の上限は docs/adr/0019。紹介文の 10000 文字は TEXT(65535 バイト)に収まる
        Schema::create('works', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title', 100);
            $table->string('catchphrase', 35)->nullable();
            $table->text('introduction')->nullable();
            $table->string('genre', 20)->nullable();
            $table->boolean('rating_cruel')->default(false);
            $table->boolean('rating_violent')->default(false);
            $table->boolean('rating_sexual')->default(false);
            $table->string('serial_status', 20)->default('running');
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
        });

        Schema::create('tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('position');
            $table->string('name', 20);

            $table->unique(['work_id', 'position']);
            $table->unique(['work_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tags');
        Schema::dropIfExists('works');
    }
};
