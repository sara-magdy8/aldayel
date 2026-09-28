<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Add as NOT NULL with a temporary default so it can be created on a
        // table that already has rows without doctrine/dbal.
        Schema::table('properties', function (Blueprint $table) {
            $table->string('property_code')->default('')->after('name');
        });

        // Backfill existing rows with a unique placeholder code (P-{id}) so the
        // unique index below can be added without collisions.
        DB::statement("UPDATE properties SET property_code = CONCAT('P-', id) WHERE property_code = '' OR property_code IS NULL");

        Schema::table('properties', function (Blueprint $table) {
            $table->unique('property_code');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropUnique(['property_code']);
            $table->dropColumn('property_code');
        });
    }
};
