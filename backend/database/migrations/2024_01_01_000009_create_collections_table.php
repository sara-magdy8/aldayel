<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('collections', function (Blueprint $table) {
            $table->id();
            $table->string('collection_number')->unique();
            $table->foreignId('collection_type_id')->constrained('collection_types')->restrictOnDelete();
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            $table->foreignId('property_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('unit_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('broker')->nullable();
            $table->foreignId('payment_beneficiary_id')->constrained('payment_beneficiaries')->restrictOnDelete();
            $table->decimal('amount', 12, 3);
            $table->date('payment_date');
            $table->foreignId('payment_type_id')->constrained('payment_types')->restrictOnDelete();
            // Cheque
            $table->string('check_number')->nullable();
            $table->string('check_bank')->nullable();
            $table->date('check_date')->nullable();
            // Transfer
            $table->string('transfer_bank')->nullable();
            $table->string('transfer_transaction_number')->nullable();
            $table->date('transfer_date')->nullable();
            // Card
            $table->enum('card_type', ['فيزا', 'ماستركارد', 'مدى'])->nullable();
            $table->string('card_transaction_number')->nullable();
            $table->string('card_last4', 4)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('has_invoice')->default(false);
            $table->string('invoice_number')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void { Schema::dropIfExists('collections'); }
};
