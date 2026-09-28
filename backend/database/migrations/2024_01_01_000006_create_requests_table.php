<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            $table->boolean('request_type')->comment('0=>إيجار, 1=>شراء');
            $table->foreignId('property_cat_id')->constrained('property_cats')->restrictOnDelete();
            $table->string('region')->nullable();
            $table->string('location')->nullable();
            $table->decimal('area', 10, 2)->nullable();
            $table->string('broker')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('request_status_id')->constrained('request_statuses')->restrictOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void { Schema::dropIfExists('requests'); }
};
