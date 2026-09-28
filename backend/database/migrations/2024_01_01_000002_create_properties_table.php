<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('properties', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('property_type')->default(0)->comment('0=>مستقل, 1=>متعدد الوحدات');
            $table->boolean('listing_type')->comment('0=>إيجار, 1=>بيع');
            $table->foreignId('property_cat_id')->constrained('property_cats')->restrictOnDelete();
            $table->foreignId('owner_id')->constrained('clients')->restrictOnDelete();
            $table->string('plot_number');
            $table->decimal('area', 10, 2)->nullable();
            $table->string('address');
            $table->string('location_link')->nullable();
            $table->text('description')->nullable();
            $table->string('guard_phone')->nullable();
            $table->decimal('commission', 10, 3)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('property_status_id')->constrained('property_statuses')->restrictOnDelete();
            $table->decimal('rent_amount', 10, 3)->nullable();
            $table->decimal('price', 10, 3)->nullable();
            $table->text('conditions')->nullable();
            $table->string('grace_period')->nullable();
            $table->string('tenant_name')->nullable();
            $table->date('tenant_start')->nullable();
            $table->date('tenant_end')->nullable();
            $table->date('sale_date')->nullable();
            $table->string('public_link_token')->unique()->nullable();
            $table->boolean('public_link_enabled')->default(false);
            $table->boolean('public_show_price')->default(true);
            $table->boolean('public_show_location')->default(true);
            $table->boolean('public_show_contact')->default(false);
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('properties');
    }
};
