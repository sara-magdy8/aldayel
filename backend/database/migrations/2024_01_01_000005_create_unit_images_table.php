<?php
// database/migrations/2024_01_01_000005_create_unit_images_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('unit_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
            $table->string('image_path');
            $table->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('unit_images'); }
};
