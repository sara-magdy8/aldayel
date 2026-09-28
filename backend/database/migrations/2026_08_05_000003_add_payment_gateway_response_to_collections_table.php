<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            // The whole decrypted payload from the gateway callback, kept verbatim.
            // The columns beside it (payment_status, payment_reference, payment_paid_at)
            // are the handful of fields the app actually queries; this is the audit
            // trail — the payment method used, the administrative charge, the
            // gateway's own message — for disputes and reconciliation, where a
            // summarised record is worth little.
            $table->json('payment_gateway_response')->nullable()->after('payment_paid_at');
        });
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            $table->dropColumn('payment_gateway_response');
        });
    }
};
