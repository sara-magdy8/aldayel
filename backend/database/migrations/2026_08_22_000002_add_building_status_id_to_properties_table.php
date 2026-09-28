<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            // حالة البناء — عقارات البيع only; rental properties leave it null.
            $table->foreignId('building_status_id')->nullable()->after('filmed_by_id')
                ->constrained('building_statuses')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropConstrainedForeignId('building_status_id');
        });
    }
};
