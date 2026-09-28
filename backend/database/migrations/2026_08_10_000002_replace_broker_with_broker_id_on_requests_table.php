<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * الوسيط on a request becomes a client (type = وسيط) instead of free text,
     * matching the same move on `properties`.
     *
     * Unlike the properties change this drops the old `broker` column outright —
     * no backfill: the office asked for the typed-in names to go rather than be
     * migrated into clients. Anything recorded there is lost on `up()`, so take a
     * dump first if that text still matters.
     */
    public function up(): void
    {
        Schema::table('requests', function (Blueprint $table) {
            $table->foreignId('broker_id')->nullable()->after('price')
                  ->constrained('clients')->nullOnDelete();
            $table->dropColumn('broker');
        });
    }

    public function down(): void
    {
        Schema::table('requests', function (Blueprint $table) {
            // The column comes back empty — the names it held are gone.
            $table->string('broker')->nullable()->after('area');
            $table->dropConstrainedForeignId('broker_id');
        });
    }
};
