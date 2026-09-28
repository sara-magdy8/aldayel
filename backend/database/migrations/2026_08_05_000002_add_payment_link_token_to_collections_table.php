<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            // The secret in the shareable /pay/{token} URL. Random rather than the
            // row id: the link is handed to a client, so a guessable value would let
            // anyone enumerate other people's payment pages.
            $table->string('payment_link_token', 64)->nullable()->unique()->after('payment_gateway_id');
            // unpaid | paid | failed — the lifecycle of the link, kept apart from
            // `payment_date` so a failed attempt is distinguishable from an untouched link.
            $table->string('payment_status', 20)->default('unpaid')->after('payment_link_token');
            // Hesabe's own identifier for the settled transaction (paymentId).
            $table->string('payment_reference')->nullable()->after('payment_status');
            // The orderReferenceNumber sent on the last checkout attempt. Stored so the
            // callback can prove the response belongs to the attempt we started, and so
            // a retry can send a fresh reference without losing the earlier one silently.
            $table->string('payment_order_reference')->nullable()->after('payment_reference');
            // When the gateway confirmed the money. `payment_date` is a date column the
            // office edits; this one is the untouched gateway timestamp.
            $table->timestamp('payment_paid_at')->nullable()->after('payment_order_reference');
        });

        // Links created before this migration have no token, so their copy button would
        // have nothing to hand out. Give every existing link one.
        DB::table('collections')
            ->where('collection_method', 'payment_link')
            ->whereNull('payment_link_token')
            ->orderBy('id')
            ->pluck('id')
            ->each(fn ($id) => DB::table('collections')
                ->where('id', $id)
                ->update(['payment_link_token' => Str::random(48)]));

        // A link row that already carries a payment date was collected, so it is paid.
        DB::table('collections')
            ->where('collection_method', 'payment_link')
            ->whereNotNull('payment_date')
            ->update(['payment_status' => 'paid']);
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            $table->dropColumn([
                'payment_link_token',
                'payment_status',
                'payment_reference',
                'payment_order_reference',
                'payment_paid_at',
            ]);
        });
    }
};
