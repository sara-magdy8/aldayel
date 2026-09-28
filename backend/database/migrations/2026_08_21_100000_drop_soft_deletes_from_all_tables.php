<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Delete means delete: the seven soft-deleting tables lose their `deleted_at`
 * column, so every destroy() from here on removes the row for good.
 *
 * Rows already sitting in the recycle bin are purged rather than carried over —
 * a user deleted them, and keeping the rows while dropping the column would
 * quietly resurrect them into every listing.
 *
 * The purge runs children-first because the contracts / collections tables hold
 * restrictOnDelete keys back onto properties, units and clients.
 */
return new class extends Migration
{
    /** Child-to-parent, so no purge step trips a restrictOnDelete key. */
    private const TABLES = [
        'collections',
        'sale_contracts',
        'rental_contracts',
        'requests',
        'units',
        'properties',
        'clients',
    ];

    public function up(): void
    {
        DB::transaction(function () {
            foreach (self::TABLES as $table) {
                if (Schema::hasColumn($table, 'deleted_at')) {
                    DB::table($table)->whereNotNull('deleted_at')->delete();
                }
            }
        });

        foreach (self::TABLES as $table) {
            if (Schema::hasColumn($table, 'deleted_at')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropSoftDeletes();
                });
            }
        }
    }

    /**
     * The column comes back empty. The purged rows are gone for good — this is
     * a one-way migration in terms of data.
     */
    public function down(): void
    {
        foreach (array_reverse(self::TABLES) as $table) {
            if (! Schema::hasColumn($table, 'deleted_at')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->softDeletes();
                });
            }
        }
    }
};
