<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('requests', function (Blueprint $table) {
            // Structured location replaces the free-text region/location fields.
            // Signed `integer` to match governorates.id / areas.id (int(11)).
            $table->integer('governorate_id')->nullable()->after('property_cat_id');
            $table->integer('area_id')->nullable()->after('governorate_id');

            $table->foreign('governorate_id')->references('id')->on('governorates')->nullOnDelete();
            $table->foreign('area_id')->references('id')->on('areas')->nullOnDelete();

            $table->dropColumn(['region', 'location']);
        });
    }

    public function down(): void
    {
        Schema::table('requests', function (Blueprint $table) {
            $table->dropForeign(['area_id']);
            $table->dropForeign(['governorate_id']);
            $table->dropColumn(['area_id', 'governorate_id']);

            $table->string('region')->nullable()->after('property_cat_id');
            $table->string('location')->nullable()->after('region');
        });
    }
};
