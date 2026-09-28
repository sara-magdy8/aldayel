<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->string('forsale_link')->nullable()->after('broker_phone_num');
            $table->string('instagram_link')->nullable()->after('forsale_link');
            $table->string('whatsapp_link')->nullable()->after('instagram_link');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn(['forsale_link', 'instagram_link', 'whatsapp_link']);
        });
    }
};
