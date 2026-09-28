<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Mirrors the activity change (create_activity_request_table): moves a request's
 * "المنطقة" from a single `area_id` FK to a many-to-many pivot, so one request can
 * name several areas the client would accept. Existing single values are migrated
 * into the pivot before the column is dropped, leaving the pivot the only place a
 * request's areas live — no column and pivot to drift apart.
 *
 * المحافظة stays single: the areas on a request all belong to it, and the form
 * scopes its area list to the chosen governorate.
 *
 * `integer` rather than `foreignId` for area_id because areas.id is a signed
 * int(11), and a foreign key has to match its referenced column's type exactly.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('area_request', function (Blueprint $table) {
            $table->foreignId('request_id')->constrained('requests')->cascadeOnDelete();
            $table->integer('area_id');
            $table->primary(['request_id', 'area_id']);

            $table->foreign('area_id')->references('id')->on('areas')->cascadeOnDelete();
        });

        // Carry each request's existing single area into the pivot.
        DB::table('requests')
            ->whereNotNull('area_id')
            ->select('id', 'area_id')
            ->orderBy('id')
            ->chunk(500, function ($rows) {
                DB::table('area_request')->insert(
                    $rows->map(fn ($r) => [
                        'request_id' => $r->id,
                        'area_id'    => $r->area_id,
                    ])->all()
                );
            });

        Schema::table('requests', function (Blueprint $table) {
            $table->dropForeign(['area_id']);
            $table->dropColumn('area_id');
        });
    }

    public function down(): void
    {
        Schema::table('requests', function (Blueprint $table) {
            $table->integer('area_id')->nullable()->after('governorate_id');
            $table->foreign('area_id')->references('id')->on('areas')->nullOnDelete();
        });

        // A single column cannot hold what the pivot held, so the first area of
        // each request is restored and any others are dropped.
        DB::table('area_request')
            ->orderBy('request_id')
            ->get()
            ->groupBy('request_id')
            ->each(function ($rows, $requestId) {
                DB::table('requests')->where('id', $requestId)
                    ->update(['area_id' => $rows->first()->area_id]);
            });

        Schema::dropIfExists('area_request');
    }
};
