<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->foreignId('filmed_by_id')->nullable()->after('property_cat_id')
                ->constrained('filmed_by')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropConstrainedForeignId('filmed_by_id');
        });
    }
};
