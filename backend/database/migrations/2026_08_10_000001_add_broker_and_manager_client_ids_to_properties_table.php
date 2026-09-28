<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * الوسيط / مسؤول العقار move from free-text name+phone pairs onto the clients
     * table (type = وسيط / مسؤول العقار), mirroring how `owner_id` already works.
     *
     * The old `broker_name` / `broker_phone_num` / `manager_name` /
     * `manager_phone_num` columns are deliberately kept: they are the source the
     * `properties:link-broker-manager-clients` command reads to create the
     * clients and fill these ids in, and they remain the display fallback for any
     * row the backfill could not resolve. Drop them only once the backfill has
     * run everywhere and the fallback is no longer needed.
     */
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->foreignId('broker_id')->nullable()->after('manager_phone_num')
                  ->constrained('clients')->nullOnDelete();
            $table->foreignId('manager_id')->nullable()->after('broker_id')
                  ->constrained('clients')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropConstrainedForeignId('manager_id');
            $table->dropConstrainedForeignId('broker_id');
        });
    }
};
