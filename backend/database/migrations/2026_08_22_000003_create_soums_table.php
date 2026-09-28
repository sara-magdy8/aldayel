<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * السوم — the bids placed on a listing.
 *
 * A bid belongs to one property and is only ever read through it, so the rows
 * go away with the listing (cascade) rather than blocking its deletion.
 *
 * `soum_type` follows the tinyint-with-comment convention used by
 * clients.type / properties.listing_type: storage is numeric, the Arabic label
 * is produced by the model accessor. The two broker columns are nullable
 * because they only exist for a غير مباشر bid — the controller clears them
 * again when a bid is switched back to مباشر.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('soums', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained()->cascadeOnDelete();
            $table->string('bidder_name');
            $table->date('soum_date');
            $table->decimal('amount', 10, 3);
            $table->boolean('soum_type')->default(0)->comment('0=>مباشر, 1=>غير مباشر');
            $table->string('broker_name')->nullable();
            $table->string('broker_phone', 20)->nullable();
            $table->timestamps();

            // The list is always "this property's bids, newest first".
            $table->index(['property_id', 'soum_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('soums');
    }
};
