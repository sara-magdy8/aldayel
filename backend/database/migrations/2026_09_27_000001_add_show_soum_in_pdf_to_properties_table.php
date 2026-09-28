<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // عقارات البيع only: whether the property PDF prints the highest السوم.
        Schema::table('properties', function (Blueprint $table) {
            $table->boolean('show_soum_in_pdf')->default(false)->after('marketing_status');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn('show_soum_in_pdf');
        });
    }
};
