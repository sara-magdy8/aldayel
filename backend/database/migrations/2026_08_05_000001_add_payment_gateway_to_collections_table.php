<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            // Which of the office's saved gateway accounts processes this link.
            // Null on manual collections (and on links created before this column).
            // nullOnDelete rather than cascade: removing a gateway account from the
            // settings screen must not delete the collections paid through it.
            $table->foreignId('payment_gateway_id')
                ->nullable()
                ->after('payment_link_channel')
                ->constrained('payment_gateways')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            $table->dropForeign(['payment_gateway_id']);
            $table->dropColumn('payment_gateway_id');
        });
    }
};
