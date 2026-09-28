<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * إيجار and بيع now number their properties independently — each series starts at
 * 1 — so the same code exists once on each side. The global unique index on
 * property_code cannot express that; the pair (listing_type, property_code) can.
 *
 * Widening a unique index never conflicts with existing rows, so no backfill is
 * needed: the codes already issued stay valid and each series simply continues
 * from its own highest number.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropUnique(['property_code']);
            $table->unique(['listing_type', 'property_code']);
        });
    }

    /**
     * Reversible only while the two series have not yet issued the same code. Once
     * إيجار 1 and بيع 1 both exist the global index cannot be recreated — drop the
     * duplicates first if this ever has to roll back.
     */
    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropUnique(['listing_type', 'property_code']);
            $table->unique('property_code');
        });
    }
};
