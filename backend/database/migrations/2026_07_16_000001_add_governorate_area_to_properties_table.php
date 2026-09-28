<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            // Structured location: replaces the free-text `address` as the input.
            // `address` is now derived (composed as "governorate - area") on save.
            // Nullable so existing rows (which only have address text) stay valid.
            // Column type is `integer` (signed) to match governorates.id / areas.id,
            // which are int(11) — a bigint FK column would fail the constraint.
            $table->integer('governorate_id')->nullable()->after('plot_number');
            $table->integer('area_id')->nullable()->after('governorate_id');

            $table->foreign('governorate_id')->references('id')->on('governorates')->nullOnDelete();
            $table->foreign('area_id')->references('id')->on('areas')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropForeign(['area_id']);
            $table->dropForeign(['governorate_id']);
            $table->dropColumn(['area_id', 'governorate_id']);
        });
    }
};
