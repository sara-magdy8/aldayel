<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Makes a unit's type (property_cat_id) optional. The bulk-add screen no longer
 * asks for a unit type — it collects activities instead — so units created that
 * way have no category until one is set from the single-unit form.
 *
 * MySQL will not alter a column that a foreign key points at, so the constraint
 * is dropped and re-created around the change.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('units', function (Blueprint $table) {
            $table->dropForeign(['property_cat_id']);
        });

        Schema::table('units', function (Blueprint $table) {
            $table->foreignId('property_cat_id')->nullable()->change();
        });

        Schema::table('units', function (Blueprint $table) {
            $table->foreign('property_cat_id')->references('id')->on('property_cats')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        // Restoring NOT NULL requires every row to have a value, so units left
        // without a type inherit their parent property's category first.
        DB::statement(
            'UPDATE units u JOIN properties p ON p.id = u.property_id
             SET u.property_cat_id = p.property_cat_id
             WHERE u.property_cat_id IS NULL'
        );

        Schema::table('units', function (Blueprint $table) {
            $table->dropForeign(['property_cat_id']);
        });

        Schema::table('units', function (Blueprint $table) {
            $table->foreignId('property_cat_id')->nullable(false)->change();
        });

        Schema::table('units', function (Blueprint $table) {
            $table->foreign('property_cat_id')->references('id')->on('property_cats')->restrictOnDelete();
        });
    }
};
