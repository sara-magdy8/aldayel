<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->string('broker_name')->nullable()->after('guard_phone');
            $table->string('broker_phone_num')->nullable()->after('broker_name');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn(['broker_name', 'broker_phone_num']);
        });
    }
};
