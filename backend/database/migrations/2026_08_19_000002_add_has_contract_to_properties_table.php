<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Flags whether the property is covered by a contract. Every existing row
     * starts at 0; nothing sets it to 1 yet.
     */
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->boolean('has_contract')->default(0)->after('sale_date');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn('has_contract');
        });
    }
};
