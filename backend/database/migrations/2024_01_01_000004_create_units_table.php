<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained()->cascadeOnDelete();
            $table->string('unit_number');
            $table->foreignId('property_cat_id')->constrained('property_cats')->restrictOnDelete();
            $table->string('floor')->nullable();
            $table->decimal('area', 10, 2)->nullable();
            $table->integer('rooms_count')->nullable();
            $table->decimal('price', 10, 3)->nullable();
            $table->boolean('listing_type')->comment('0=>إيجار, 1=>بيع');
            $table->foreignId('property_status_id')->constrained('property_statuses')->restrictOnDelete();
            $table->text('notes')->nullable();
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
        Schema::dropIfExists('units');
    }
};
