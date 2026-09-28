<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('units', function (Blueprint $table) {
            // Same shape as the matching columns on properties: المواصفات /
            // الشروط are free text, فترة السماح is a short free-form string
            // ("15 يوم") rather than a number.
            $table->text('description')->nullable()->after('notes');
            $table->text('conditions')->nullable()->after('description');
            $table->string('grace_period')->nullable()->after('conditions');
        });
    }

    public function down(): void
    {
        Schema::table('units', function (Blueprint $table) {
            $table->dropColumn(['description', 'conditions', 'grace_period']);
        });
    }
};
