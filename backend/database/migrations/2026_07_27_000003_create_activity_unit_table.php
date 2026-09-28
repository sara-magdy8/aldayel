<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gives units their own activities, mirroring `activity_property`. A unit
 * previously had no activity of its own and fell back to its parent property's;
 * the bulk-add screen now assigns activities per unit instead of a unit type.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('activity_unit', function (Blueprint $table) {
            $table->foreignId('unit_id')->constrained('units')->cascadeOnDelete();
            $table->foreignId('activity_id')->constrained('activities')->cascadeOnDelete();
            $table->primary(['unit_id', 'activity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_unit');
    }
};
