<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // `address` is now derived from governorate_id / area_id (see the
        // Property::getAddressAttribute accessor), so the stored column is
        // redundant and removed to keep location data in one place.
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn('address');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->string('address')->nullable()->after('area_id');
        });
    }
};
