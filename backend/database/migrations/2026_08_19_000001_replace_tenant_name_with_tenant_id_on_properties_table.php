<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * المستأجر moves from a free-text name onto the clients table (type = فرد /
     * شركة), the same move `owner_id` / `broker_id` / `manager_id` already made.
     * `tenant_name` becomes an accessor reading through the relation, so every
     * consumer of `->tenant_name` keeps working unchanged.
     *
     * Existing names are matched against clients by exact full_name; anything
     * that does not resolve to a client is dropped along with the column, so the
     * backfill below is the only chance to keep it.
     */
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('grace_period')
                  ->constrained('clients')->nullOnDelete();
        });

        // Lowest matching id wins when several clients share a name — an
        // arbitrary but stable pick, and duplicate names are the rare case.
        DB::statement('
            UPDATE properties p
            JOIN (
                SELECT full_name, MIN(id) AS id
                FROM clients
                WHERE deleted_at IS NULL
                GROUP BY full_name
            ) c ON c.full_name = p.tenant_name
            SET p.tenant_id = c.id
            WHERE p.tenant_name IS NOT NULL AND p.tenant_name <> ""
        ');

        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn('tenant_name');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->string('tenant_name')->nullable()->after('grace_period');
        });

        DB::statement('
            UPDATE properties p
            JOIN clients c ON c.id = p.tenant_id
            SET p.tenant_name = c.full_name
        ');

        Schema::table('properties', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tenant_id');
        });
    }
};
