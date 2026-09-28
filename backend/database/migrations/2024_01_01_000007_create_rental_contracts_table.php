<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('rental_contracts', function (Blueprint $table) {
            $table->id();
            $table->string('contract_number')->unique();
            $table->foreignId('property_id')->constrained()->restrictOnDelete();
            $table->foreignId('unit_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('tenant_id')->constrained('clients')->restrictOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->decimal('total_amount', 12, 3);
            $table->foreignId('payment_term_id')->constrained('payment_terms')->restrictOnDelete();
            $table->foreignId('payment_type_id')->constrained('payment_types')->restrictOnDelete();
            $table->decimal('deposit_amount', 12, 3)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('contract_status_id')->constrained('contract_statuses')->restrictOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void { Schema::dropIfExists('rental_contracts'); }
};
