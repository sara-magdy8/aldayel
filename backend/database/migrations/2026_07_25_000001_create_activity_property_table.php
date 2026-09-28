<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Moves a property's "activity" from a single `activity_id` FK to a many-to-many
 * pivot so a property can carry multiple activities. Existing single values are
 * migrated into the pivot before the column is dropped.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('activity_property', function (Blueprint $table) {
            $table->foreignId('property_id')->constrained('properties')->cascadeOnDelete();
            $table->foreignId('activity_id')->constrained('activities')->cascadeOnDelete();
            $table->primary(['property_id', 'activity_id']);
        });

        // Carry each property's existing single activity into the pivot.
        DB::table('properties')
            ->whereNotNull('activity_id')
            ->select('id', 'activity_id')
            ->orderBy('id')
            ->chunk(500, function ($rows) {
                DB::table('activity_property')->insert(
                    $rows->map(fn ($r) => [
                        'property_id' => $r->id,
                        'activity_id' => $r->activity_id,
                    ])->all()
                );
            });

        Schema::table('properties', function (Blueprint $table) {
            $table->dropConstrainedForeignId('activity_id');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->foreignId('activity_id')->nullable()->after('priority')
                ->constrained('activities')->nullOnDelete();
        });

        // Restore a single activity_id per property (first one) from the pivot.
        DB::table('activity_property')
            ->orderBy('property_id')
            ->get()
            ->groupBy('property_id')
            ->each(function ($rows, $propertyId) {
                DB::table('properties')->where('id', $propertyId)
                    ->update(['activity_id' => $rows->first()->activity_id]);
            });

        Schema::dropIfExists('activity_property');
    }
};
