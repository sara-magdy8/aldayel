<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('requests', function (Blueprint $table) {
            // السعر المطلوب — the client's budget for the request, in KWD.
            // Same precision as properties.price so the two compare cleanly.
            $table->decimal('price', 10, 3)->nullable()->after('area');
        });
    }

    public function down(): void
    {
        Schema::table('requests', function (Blueprint $table) {
            $table->dropColumn('price');
        });
    }
};
