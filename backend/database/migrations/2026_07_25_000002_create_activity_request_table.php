<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Mirrors the property change: moves a request's "activity" from a single
 * `activity_id` FK to a many-to-many pivot so a request can carry multiple
 * activities. Existing single values are migrated into the pivot before the
 * column is dropped.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('activity_request', function (Blueprint $table) {
            $table->foreignId('request_id')->constrained('requests')->cascadeOnDelete();
            $table->foreignId('activity_id')->constrained('activities')->cascadeOnDelete();
            $table->primary(['request_id', 'activity_id']);
        });

        // Carry each request's existing single activity into the pivot.
        DB::table('requests')
            ->whereNotNull('activity_id')
            ->select('id', 'activity_id')
            ->orderBy('id')
            ->chunk(500, function ($rows) {
                DB::table('activity_request')->insert(
                    $rows->map(fn ($r) => [
                        'request_id'  => $r->id,
                        'activity_id' => $r->activity_id,
                    ])->all()
                );
            });

        Schema::table('requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('activity_id');
        });
    }

    public function down(): void
    {
        Schema::table('requests', function (Blueprint $table) {
            $table->foreignId('activity_id')->nullable()->after('property_cat_id')
                ->constrained('activities')->nullOnDelete();
        });

        // Restore a single activity_id per request (first one) from the pivot.
        DB::table('activity_request')
            ->orderBy('request_id')
            ->get()
            ->groupBy('request_id')
            ->each(function ($rows, $requestId) {
                DB::table('requests')->where('id', $requestId)
                    ->update(['activity_id' => $rows->first()->activity_id]);
            });

        Schema::dropIfExists('activity_request');
    }
};
