<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('payment_gateways', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // Provider slug — only "hesabe" is supported for now.
            $table->string('gateway')->default('hesabe');
            // Provider-specific credentials; the field set differs per gateway
            // (Hesabe: merchant_code, access_code, secret_key, iv_key). Held as
            // text, not json: the model encrypts the JSON with the app key, so
            // what lands here is ciphertext.
            $table->text('credentials')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('payment_gateways'); }
};
