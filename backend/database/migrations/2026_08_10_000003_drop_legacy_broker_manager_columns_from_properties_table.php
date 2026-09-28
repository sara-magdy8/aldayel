<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Final step of the الوسيط / مسؤول العقار move onto the clients table: drop
     * the free-text columns now that `broker_id` / `manager_id` carry the link.
     *
     * RUN `php artisan properties:link-broker-manager-clients` FIRST. These columns
     * are its only input, and the names/phones in them are gone for good once this
     * runs — `down()` brings the columns back empty. Anything still unlinked at
     * that point loses its broker/manager outright.
     *
     * After this the four `*_name` / `*_phone_num` keys are pure accessors on the
     * Property model, which is why they move into `$appends` in the same change —
     * an accessor with no column behind it is not serialised otherwise.
     */
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn(['broker_name', 'broker_phone_num', 'manager_name', 'manager_phone_num']);
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            // The columns come back empty — the text they held is gone. The data
            // itself survives as the linked clients, via broker_id / manager_id.
            $table->string('broker_name')->nullable()->after('guard_phone');
            $table->string('broker_phone_num')->nullable()->after('broker_name');
            $table->string('manager_name')->nullable()->after('broker_phone_num');
            $table->string('manager_phone_num')->nullable()->after('manager_name');
        });
    }
};
