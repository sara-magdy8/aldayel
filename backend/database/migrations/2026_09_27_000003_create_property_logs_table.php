<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * سجل العقار — one row per event on a property or anything hanging off it
 * (units, contracts, collections, bids, attachments). Written by model
 * observers (see App\Support\PropertyLogger), never by the client.
 *
 * The log belongs to the property and goes away with it (cascade). The user
 * and unit links survive their row's deletion as null — the description text
 * already names what happened.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained()->cascadeOnDelete();
            $table->foreignId('unit_id')->nullable()->constrained()->nullOnDelete();
            // Null when the change came from no signed-in user (payment callback, console).
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 50);
            $table->string('description', 500);
            // {label: [old, new]} for edits; null for plain events.
            $table->json('changes')->nullable();
            $table->timestamp('created_at')->useCurrent();

            // The only read is "this property's log, newest first".
            $table->index(['property_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_logs');
    }
};
