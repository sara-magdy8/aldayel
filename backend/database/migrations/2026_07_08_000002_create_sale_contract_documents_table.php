<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('sale_contract_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_contract_id')->constrained()->cascadeOnDelete();
            // Named document slot: civil_id, license, incorporation_contract,
            // signature_authorization, commercial_extract. One file per type.
            $table->string('type');
            $table->string('file_path');
            $table->string('file_name');
            $table->timestamps();

            $table->unique(['sale_contract_id', 'type']);
        });
    }

    public function down(): void { Schema::dropIfExists('sale_contract_documents'); }
};
