<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The ledger of expiry reminders already mailed for a rental contract.
 *
 * The office configures how many reminders it wants before a lease ends and how
 * many days before expiry each one fires (settings `rental_expiry_alert_count` /
 * `rental_expiry_alert_days`). `contracts:send-expiry-alerts` runs daily and
 * would otherwise re-announce the same contract every morning, so one row is
 * written per (contract, offset) once the mail is away.
 *
 * Keyed on the offset rather than on the contract alone because each reminder is
 * its own event: the 60-day notice going out must not silence the 7-day one.
 *
 * Rows are kept after the lease ends — a lease can be extended, and its history
 * of what was already announced is what stops the extension re-sending.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rental_contract_expiry_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rental_contract_id')->constrained()->cascadeOnDelete();
            // The configured offset this row satisfies, in days before end_date.
            // Bounded at 365 by the settings endpoint, so smallint is ample.
            $table->unsignedSmallInteger('days_before');
            $table->timestamps();

            // The dedupe itself: makes insertOrIgnore safe when two runs overlap,
            // and backs the per-contract lookup the command does on every pass.
            // Named explicitly — the generated name would run past MySQL's
            // 64-character identifier limit.
            $table->unique(['rental_contract_id', 'days_before'], 'rce_alerts_contract_days_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rental_contract_expiry_alerts');
    }
};
