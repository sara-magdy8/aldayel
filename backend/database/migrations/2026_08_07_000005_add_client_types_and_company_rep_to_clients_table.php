<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            // `type` was a boolean (0=>فرد, 1=>شركة); it now carries four values.
            $table->unsignedTinyInteger('type')->default(0)
                  ->comment('0=>فرد, 1=>شركة, 2=>وسيط, 3=>مسؤول العقار')
                  ->change();

            // Representative of the company — only filled when type = 1 (شركة).
            $table->string('company_rep_name')->nullable()->after('type');
            $table->string('company_rep_phone', 20)->nullable()->after('company_rep_name');
        });
    }

    public function down(): void
    {
        // Collapse the two new types back onto فرد so the boolean column stays truthful.
        DB::table('clients')->whereIn('type', [2, 3])->update(['type' => 0]);

        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn(['company_rep_name', 'company_rep_phone']);
            $table->boolean('type')->default(0)->comment('0=>فرد, 1=>شركة')->change();
        });
    }
};
