<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            // How the money was collected. Every existing row is money already in
            // hand, so the default backfills them correctly.
            $table->string('collection_method', 20)->default('manual')->after('amount');

            // Payment-link settings — null on manual collections.
            $table->unsignedSmallInteger('payment_link_expiry_days')->nullable()->after('payment_type_id');
            // Days before expiry to nudge the client; 0 means no reminder.
            $table->unsignedSmallInteger('payment_link_reminder_days')->nullable()->after('payment_link_expiry_days');
            // The gateways offered on the link, e.g. ["كي نت", "Apple Pay"].
            $table->json('payment_link_gateways')->nullable()->after('payment_link_reminder_days');
            // Delivery channel: whatsapp | email | copy.
            $table->string('payment_link_channel', 20)->nullable()->after('payment_link_gateways');
        });

        // A payment link has no payment date until the client actually pays.
        Schema::table('collections', function (Blueprint $table) {
            $table->date('payment_date')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Restoring NOT NULL fails on any link row that was never paid, so give
        // those a date first rather than letting the rollback blow up.
        DB::table('collections')
            ->whereNull('payment_date')
            ->update(['payment_date' => DB::raw('DATE(created_at)')]);

        Schema::table('collections', function (Blueprint $table) {
            $table->date('payment_date')->nullable(false)->change();
        });

        Schema::table('collections', function (Blueprint $table) {
            $table->dropColumn([
                'collection_method',
                'payment_link_expiry_days',
                'payment_link_reminder_days',
                'payment_link_gateways',
                'payment_link_channel',
            ]);
        });
    }
};
