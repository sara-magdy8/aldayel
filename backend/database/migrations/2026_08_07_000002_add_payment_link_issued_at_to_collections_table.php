<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            // When the current link was issued — the anchor the expiry counts from.
            //
            // Until a link is reissued this is null and the expiry counts from
            // `created_at`, exactly as before. Reissuing writes today's date here so
            // the new link gets a full expiry window; `created_at` stays the date the
            // collection was recorded, which is what the office's reporting reads.
            $table->timestamp('payment_link_issued_at')->nullable()->after('payment_link_token');
        });
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            $table->dropColumn('payment_link_issued_at');
        });
    }
};
