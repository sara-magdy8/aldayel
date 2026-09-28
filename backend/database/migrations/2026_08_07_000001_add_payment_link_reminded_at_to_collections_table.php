<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            // Stamped once the expiry reminder has gone out, so re-running the
            // daily command — or running it by hand to test — cannot mail the
            // same client twice. Null on every existing row: none was reminded.
            $table->timestamp('payment_link_reminded_at')->nullable()->after('payment_paid_at');
        });
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            $table->dropColumn('payment_link_reminded_at');
        });
    }
};
