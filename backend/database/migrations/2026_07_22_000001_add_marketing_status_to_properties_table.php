<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->boolean('marketing_status')->default(false)->after('whatsapp_link');
        });

        // Backfill with the old derived rule: a property counted as "تم التسويق"
        // when all three marketing links were filled in.
        DB::table('properties')
            ->whereNotNull('forsale_link')->where('forsale_link', '!=', '')
            ->whereNotNull('instagram_link')->where('instagram_link', '!=', '')
            ->whereNotNull('whatsapp_link')->where('whatsapp_link', '!=', '')
            ->update(['marketing_status' => true]);
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn('marketing_status');
        });
    }
};
