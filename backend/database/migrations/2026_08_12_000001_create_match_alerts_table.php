<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The ledger of property↔request pairings the admins have already been told about.
 *
 * `matches:alert-admins` runs on a schedule and would otherwise re-announce the
 * same pairing on every run. One row per pair, written only after the mail is
 * actually away, so a failed send is retried on the next run rather than lost.
 *
 * Keyed on the pair rather than on either record so both matching directions
 * share one memory: a pairing announced while scanning the requests is not
 * announced again from the property side.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('match_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained()->cascadeOnDelete();
            // `requests` is the property-requests table (see PropertyRequest::$table).
            $table->foreignId('request_id')->constrained('requests')->cascadeOnDelete();
            $table->timestamps();

            // The dedupe itself: makes insertOrIgnore safe when two runs overlap,
            // and backs the per-request lookup the command does on every pass.
            $table->unique(['property_id', 'request_id']);
            $table->index('request_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('match_alerts');
    }
};
