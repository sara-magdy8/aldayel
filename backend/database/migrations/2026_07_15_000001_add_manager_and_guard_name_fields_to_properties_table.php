<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->string('guard_name')->nullable()->after('description');
            $table->string('manager_name')->nullable()->after('broker_phone_num');
            $table->string('manager_phone_num')->nullable()->after('manager_name');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn(['guard_name', 'manager_name', 'manager_phone_num']);
        });
    }
};
